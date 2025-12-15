<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\OrderItems;
use App\Models\Order;
use App\Models\Product;
use App\Models\Inventory;
use App\Http\Requests\StoreOrderItemsRequest;
use App\Http\Requests\UpdateOrderItemsRequest;
use Illuminate\Support\Facades\DB;

class OrderItemsController extends Controller
{
    // 🟩 Get all order items
    public function index()
    {
        $orderItems = OrderItems::with(['order', 'product'])->get();
        return response()->json($orderItems);
    }

    // 🟦 Create new order item
    public function store(StoreOrderItemsRequest $request)
    {
        $validated = $request->validated();

        // Check if order exists
        $order = Order::find($validated['order_id']);
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        // Check if product exists
        $product = Product::find($validated['product_id']);
        if (!$product) {
            return response()->json(['message' => 'Product not found'], 404);
        }

        // Create order item
        $orderItem = OrderItems::create($validated);

        return response()->json([
            'message' => 'Order item added successfully!',
            'data' => $orderItem
        ], 201);
    }

    // 🟨 Show single order item
    public function show($id)
    {
        $orderItem = OrderItems::with(['order', 'product'])->find($id);

        if (!$orderItem) {
            return response()->json(['message' => 'Order item not found'], 404);
        }

        return response()->json($orderItem);
    }

    // PUT /api/order-items/{id}
    public function update(UpdateOrderItemsRequest $request, $id)
    {
        $orderItem = OrderItems::findOrFail($id);
        $validated = $request->validated();

        DB::beginTransaction();
        try {
            // If quantity is being updated, adjust inventory
            if (isset($validated['quantity']) && $validated['quantity'] != $orderItem->quantity) {
                $qtyDifference = $validated['quantity'] - $orderItem->quantity;
                $inventory = Inventory::where('product_id', $orderItem->product_id)->first();

                if ($inventory) {
                    // If new qty is higher, we need more stock
                    if ($qtyDifference > 0 && $inventory->quantity < $qtyDifference) {
                        throw new \Exception("Not enough stock available. Available: {$inventory->quantity}, Needed: {$qtyDifference}");
                    }

                    $inventory->quantity -= $qtyDifference;
                    $inventory->save();
                }
            }

            // Update the order item
            $orderItem->update($validated);

            // Recalculate order total
            $order = Order::find($orderItem->order_id);
            if ($order) {
                $total = OrderItems::where('order_id', $order->id)->sum(DB::raw('quantity * price'));
                $order->update(['total_amount' => $total]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Order item updated successfully',
                'data' => $orderItem->load('order', 'product')
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    // DELETE /api/order-items/{id}
    public function destroy($id)
    {
        $orderItem = OrderItems::findOrFail($id);
        $orderId = $orderItem->order_id;

        DB::beginTransaction();
        try {
            // 1️⃣ Restore inventory for this item
            $inventory = Inventory::where('product_id', $orderItem->product_id)->first();
            if ($inventory) {
                $inventory->quantity += $orderItem->quantity;
                $inventory->save();
            }

            // 2️⃣ Delete the order item
            $orderItem->delete();

            // 3️⃣ Recalculate order total
            $order = Order::find($orderId);
            if ($order) {
                $total = OrderItems::where('order_id', $orderId)->sum(DB::raw('quantity * price'));
                $order->update(['total_amount' => $total]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Order item removed successfully and stock restored'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    // DELETE /api/orders/{orderId}/order-items/{itemId}
    // Delete order-item from specific order (validates order belongs to item)
    public function destroyFromOrder($orderId, $itemId)
    {
        $orderItem = OrderItems::findOrFail($itemId);

        // Verify the item belongs to the specified order
        if ($orderItem->order_id != $orderId) {
            return response()->json([
                'error' => "Order-item {$itemId} does not belong to order {$orderId}"
            ], 400);
        }

        DB::beginTransaction();
        try {
            // 1️⃣ Restore inventory for this item
            $inventory = Inventory::where('product_id', $orderItem->product_id)->first();
            if ($inventory) {
                $inventory->quantity += $orderItem->quantity;
                $inventory->save();
            }

            // 2️⃣ Delete the order item
            $orderItem->delete();

            // 3️⃣ Recalculate order total
            $order = Order::find($orderId);
            if ($order) {
                $total = OrderItems::where('order_id', $orderId)->sum(DB::raw('quantity * price'));
                $order->update(['total_amount' => $total]);
            }

            DB::commit();

            return response()->json([
                'message' => "Order-item {$itemId} removed from order {$orderId} successfully and stock restored"
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }
}
