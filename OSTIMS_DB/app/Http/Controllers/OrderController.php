<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItems;
use App\Models\Product;
use App\Models\Inventory;
use App\Models\Sales;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\UpdateOrderRequest;
use App\Services\TransactionNumberService;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function index()
    {
        // include sale relation so frontend can easily distinguish completed orders
        $orders = Order::with(['orderItems.product', 'sale'])->orderBy('id', 'desc')->get();
        return response()->json($orders);
    }

    // Public endpoint: Get orders by PC number (without auth)
    public function getByPcNumber($pcNumber)
    {
        $orders = Order::with(['orderItems.product', 'sale'])
            ->where('order_alias', 'PC-' . $pcNumber)
            ->orderBy('id', 'desc')
            ->get();

        return response()->json($orders);
    }

    // Public endpoint: Get pending orders for a session_id (guests)
    public function getBySession($sessionId)
    {
        $orders = Order::with(['orderItems.product', 'sale'])
            ->where('session_id', $sessionId)
            ->whereDoesntHave('sale')
            ->orderBy('id', 'desc')
            ->get();

        return response()->json($orders);
    }

    public function store(StoreOrderRequest $request)
    {
        $validated = $request->validated();
        $sessionId = $request->input('session_id') ?? null;

        // Server-side guard: if this session already has a pending order for
        // a different PC, reject the request. This prevents client-side
        // race conditions or tampering from creating multiple active PCs
        // for the same window/session.
        if ($sessionId) {
            $existing = Order::where('session_id', $sessionId)
                ->whereDoesntHave('sale')
                ->orderBy('id', 'desc')
                ->first();
            if ($existing) {
                // extract pc number from order_alias if present
                $existingPc = null;
                if ($existing->order_alias && preg_match('/PC-(\d+)/', $existing->order_alias, $m)) {
                    $existingPc = $m[1];
                }
                $requestedPc = $request->input('pc_number', '1');
                if ($existingPc && (string)$existingPc !== (string)$requestedPc) {
                    return response()->json([
                        'message' => 'This session already has a pending order for a different PC.',
                        'active_pc' => $existingPc
                    ], 409);
                }
            }
        }

        DB::beginTransaction();
        try {
            // 1️⃣ Create the order
            $order = Order::create([
                'order_date' => $validated['order_date'],
                'total_amount' => 0,
                'session_id' => $request->input('session_id'),
            ]);

            $total = 0;

            // 2️⃣ Loop through order_items from request
            foreach ($validated['order_items'] as $item) {
                $product = Product::with('bundleItems.bundledProduct')->find($item['product_id']);
                if (!$product) {
                    throw new \Exception("Product with ID {$item['product_id']} not found.");
                }

                // Check if this is a bundle product
                $isBundle = $product->bundleItems && $product->bundleItems->isNotEmpty();

                if ($isBundle) {
                    // For bundle products, deduct stock from each component product
                    foreach ($product->bundleItems as $bundleItem) {
                        $bundledProduct = $bundleItem->bundledProduct;
                        
                        // Only deduct stock from stockable components
                        if ($bundledProduct->is_stockable) {
                            $neededQuantity = $bundleItem->quantity * $item['quantity'];
                            
                            $inventories = Inventory::where('product_id', $bundledProduct->id)->orderBy('id', 'asc')->get();
                            if ($inventories->isEmpty()) {
                                throw new \Exception("No inventory record found for bundle component: {$bundledProduct->product_name}");
                            }

                            $available = $inventories->sum('quantity');
                            if ($available < $neededQuantity) {
                                throw new \Exception("Not enough stock for {$bundledProduct->product_name} (bundle component). Available: {$available}, Needed: {$neededQuantity}");
                            }

                            // Deduct stock across inventory records
                            $remaining = $neededQuantity;
                            foreach ($inventories as $inv) {
                                if ($remaining <= 0) break;
                                $take = min($inv->quantity, $remaining);
                                $inv->quantity -= $take;
                                $inv->save();
                                $remaining -= $take;
                            }
                        }
                    }
                } else {
                    // Regular product - only check stock if it's stockable
                    if ($product->is_stockable) {
                        $inventories = Inventory::where('product_id', $product->id)->orderBy('id', 'asc')->get();
                        if ($inventories->isEmpty()) {
                            throw new \Exception("No inventory record found for product: {$product->product_name}");
                        }

                        $available = $inventories->sum('quantity');
                        if ($available < $item['quantity']) {
                            throw new \Exception("Not enough stock for {$product->product_name}. Available: {$available}");
                        }

                        // Deduct stock across inventory records
                        $remaining = $item['quantity'];
                        foreach ($inventories as $inv) {
                            if ($remaining <= 0) break;
                            $take = min($inv->quantity, $remaining);
                            $inv->quantity -= $take;
                            $inv->save();
                            $remaining -= $take;
                        }
                    }
                }

                // Compute price
                $price = $item['price'] ?? $product->price;

                // Create order item
                OrderItems::create([
                    'order_id' => $order->id,
                    'product_id' => $item['product_id'],
                    'category_id' => $item['category_id'] ?? null,
                    'quantity' => $item['quantity'],
                    'price' => $price,
                    'notes' => $item['notes'] ?? null,
                    'cooking_preferences' => $item['cookingPreferences'] ?? null,
                ]);

                // Add to total
                $total += $price * $item['quantity'];
            }

            // 3️⃣ Update total amount and generate order alias with PC number
            $pcNumber = $request->input('pc_number', '1');
            $orderAlias = 'PC-' . $pcNumber;
            
            // Generate transaction number before updating the order
            $transactionNumber = TransactionNumberService::generateTransactionNumber($pcNumber);
            
            $order->update([
                'total_amount' => $total,
                'order_alias' => $orderAlias,
                'session_id' => $request->input('session_id'),
                'transaction_number' => $transactionNumber,
            ]);

            DB::commit();

            // Broadcast order placed so other user windows can mark PC as used
            try {
                event(new \App\Events\OrderPlaced($pcNumber, $order->id, $order->session_id));
            } catch (\Throwable $e) {
                // ignore broadcast errors
            }

            return response()->json([
                'message' => 'Order placed successfully and stock updated!',
                'data' => $order->load('orderItems.product')
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function show($id)
    {
        // include sale relation so frontend can determine completed status
        $order = Order::with(['orderItems.product', 'sale'])->find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    // GET /api/orders/completed
    // Returns orders that have an associated sale (considered completed)
    public function completed()
    {
        $orders = Order::with(['orderItems.product', 'sale'])
            ->whereHas('sale')
            ->orderBy('id', 'desc')
            ->get();

        return response()->json($orders);
    }

    // PUT /api/orders/{id}
    public function update(UpdateOrderRequest $request, $id)
    {
        $order = Order::findOrFail($id);
        $validated = $request->validated();

        $order->update($validated);

        return response()->json([
            'message' => 'Order updated successfully',
            'data' => $order->load('orderItems.product')
        ]);
    }

    // PATCH /api/orders/{id}/cancel
    public function cancel($id)
    {
        $order = Order::with('orderItems.product', 'sale')->findOrFail($id);

        DB::beginTransaction();
        try {
            // 1️⃣ Restore inventory for all items in this order
            // Create a new inventory record for each cancelled item so total
            // stock reflects the cancellation and we retain a clear history
            foreach ($order->orderItems as $item) {
                Inventory::create([
                    'product_id' => $item->product_id,
                    'quantity' => $item->quantity,
                    'type' => 'return',
                    'source' => 'order_cancelled',
                ]);
            }

            // 2️⃣ Delete all order items (cascade delete handles this, but explicit for clarity)
            OrderItems::where('order_id', $order->id)->delete();

            // 3️⃣ Delete associated sale record if it exists
            Sales::where('order_id', $order->id)->delete();

            // 4️⃣ Delete the order
            $order->delete();

            DB::commit();

            // Broadcast release of PC so user windows can update
            try {
                $pcNum = null;
                if ($order->order_alias) {
                    if (preg_match('/PC-(\d+)/', $order->order_alias, $m)) {
                        $pcNum = $m[1];
                    }
                }
                if ($pcNum) event(new \App\Events\OrderReleased($pcNum, $order->id));
            } catch (\Throwable $e) {}

            return response()->json([
                'message' => 'Order cancelled successfully and stock restored'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    // POST /api/orders/{id}/confirm
    // Mark an order as completed by creating a Sale record linked to the order.
    public function confirm($id)
    {
        $order = Order::with('orderItems')->find($id);
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        // If a sale already exists for this order, return conflict
        if ($order->sale) {
            return response()->json(['message' => 'Order already confirmed'], 409);
        }

        try {
            $sale = Sales::create([
                'sale_date' => $order->order_date,
                'total_amount' => $order->total_amount ?? 0,
                'total_order' => 1,
                'order_id' => $order->id,
            ]);

            // Broadcast release of PC when order is confirmed (completed)
            try {
                $pcNum = null;
                if ($order->order_alias) {
                    if (preg_match('/PC-(\d+)/', $order->order_alias, $m)) {
                        $pcNum = $m[1];
                    }
                }
                if ($pcNum) event(new \App\Events\OrderReleased($pcNum, $order->id));
            } catch (\Throwable $e) {}

            return response()->json([
                'message' => 'Order confirmed and sale recorded',
                'sale' => $sale,
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}
