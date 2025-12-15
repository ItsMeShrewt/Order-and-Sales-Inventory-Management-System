<?php

namespace App\Http\Controllers;

use App\Models\Sales;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class SalesController extends Controller
{
    // 🟩 Get all sales
    public function index(Request $request)
    {
        $filter = $request->query('filter'); // e.g., day, week, month, year
        $sales = Sales::query();

        if ($filter) {
            $today = Carbon::today();

            switch ($filter) {
                case 'day':
                    $sales->whereDate('sale_date', $today);
                    break;

                case 'week':
                    $sales->whereBetween('sale_date', [
                        $today->copy()->startOfWeek(),
                        $today->copy()->endOfWeek(),
                    ]);
                    break;

                case 'month':
                    $sales->whereMonth('sale_date', $today->month)
                          ->whereYear('sale_date', $today->year);
                    break;

                case 'year':
                    $sales->whereYear('sale_date', $today->year);
                    break;

                default:
                    return response()->json(['message' => 'Invalid filter value. Use day, week, month, or year.'], 400);
            }
        }

        $results = $sales->orderBy('sale_date', 'desc')->get();

        return response()->json($results);
    }

    // 🟦 Automatically record today's sale summary
    public function store(Request $request)
    {
        $today = Carbon::today();
        $force = $request->query('force'); // Add ?force=1 to overwrite existing sale

        // Get ALL orders (not filtered by date - debug)
        $allOrders = Order::all();
        
        // Get today's total sales and total orders from Orders table
        // Use a broader date check to handle timezone issues
        $todaysOrders = Order::whereDate('created_at', '>=', $today)
                            ->whereDate('created_at', '<', $today->copy()->addDay())
                            ->get();
        
        $total_amount = $todaysOrders->sum('total_amount');
        $total_orders = $todaysOrders->count();

        // Check if a sale record already exists for today
        $existingSale = Sales::whereDate('sale_date', $today)->first();
        
        if ($existingSale && !$force) {
            return response()->json([
                'message' => 'Sale record for today already exists! Use ?force=1 to update.',
                'data' => $existingSale
            ], 200);
        }

        // If force update, delete existing and create new
        if ($existingSale && $force) {
            $existingSale->delete();
        }

        // Create a new sale record
        $sale = Sales::create([
            'sale_date' => $today,
            'total_amount' => $total_amount,
            'total_order' => $total_orders,
        ]);

        return response()->json([
            'message' => 'Today\'s sales summary created successfully!',
            'data' => $sale,
            'debug' => [
                'total_amount' => $total_amount,
                'total_orders' => $total_orders,
                'today_date' => $today->toDateString(),
                'todays_orders' => $todaysOrders->toArray(),
                'all_orders_count' => $allOrders->count(),
            ]
        ], 201);
    }

    // 🟨 View specific sale record
    public function show(int $id)
    {
        $sale = Sales::find($id);

        if (!$sale) {
            return response()->json(['message' => 'Sale not found'], 404);
        }

        return response()->json($sale);
    }

    // 🟦 Monthly aggregated totals for a year (protected admin endpoint)
    // Returns an array of 12 months with sales and order counts
    public function monthlyDetails(Request $request)
    {
        $year = $request->query('year', Carbon::now()->year);

        // Get completed orders and use the order's total_amount
        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $orders = Order::whereHas('sale')
                ->whereMonth('created_at', $m)
                ->whereYear('created_at', $year)
                ->get();
            
            $total_amount = $orders->sum('total_amount');

            $months[] = [
                'month' => $m,
                'total_amount' => (float) $total_amount,
                'order_count' => $orders->count(),
            ];
        }

        return response()->json([
            'year' => (int) $year,
            'data' => $months,
        ]);
    }

    // 🟦 Monthly aggregated totals for a year (protected admin endpoint)
    // Returns an array of 12 numbers (Jan..Dec) for the provided year or the current year
    public function monthly(Request $request)
    {
        $year = $request->query('year', Carbon::now()->year);

        // Use order's total_amount for consistency
        $monthly = [];
        for ($m = 1; $m <= 12; $m++) {
            $total = Order::whereHas('sale')
                ->whereMonth('created_at', $m)
                ->whereYear('created_at', $year)
                ->sum('total_amount');
            
            $monthly[] = (float) $total;
        }

        return response()->json([
            'year' => (int) $year,
            'data' => $monthly,
        ]);
    }

    // 🟨 Cleanup orphaned sales records (sales with order_id pointing to deleted orders)
    public function cleanupOrphaned()
    {
        $deleted = DB::table('sales')
            ->leftJoin('orders', 'sales.order_id', '=', 'orders.id')
            ->whereNotNull('sales.order_id')
            ->whereNull('orders.id')
            ->delete();

        return response()->json([
            'message' => 'Orphaned sales records cleaned up',
            'deleted_count' => $deleted,
        ]);
    }
}
