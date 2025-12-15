<?php

namespace App\Http\Controllers;

use App\Models\Damage;
use Illuminate\Http\Request;

class DamageController extends Controller
{
    // GET /api/damages
    public function index()
    {
        $damages = Damage::with('product')->orderBy('created_at', 'desc')->get();
        return response()->json($damages)
            ->header('Cache-Control', 'no-cache, no-store, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    // GET /api/damages/{id}
    public function show($id)
    {
        $damage = Damage::with('product')->findOrFail($id);
        return response()->json($damage);
    }

    // POST /api/damages
    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'quantity' => 'required|integer|min:1',
            'cost_per_unit' => 'nullable|numeric|min:0',
            'reason' => 'nullable|string',
            'action_taken' => 'nullable|in:write_off,return_to_supplier',
            'notes' => 'nullable|string',
        ]);

        // If action_taken not provided, default to write_off
        if (!isset($validated['action_taken'])) {
            $validated['action_taken'] = 'write_off';
        }

        $damage = Damage::create($validated);

        return response()->json([
            'message' => 'Damage record created successfully',
            'damage' => $damage->load('product')
        ], 201);
    }

    // GET /api/damages/report/summary
    public function reportSummary()
    {
        $damages = Damage::with('product')
            ->orderBy('created_at', 'desc')
            ->get()
            ->groupBy('product_id');

        $summary = [];
        foreach ($damages as $productId => $productDamages) {
            $totalQuantity = $productDamages->sum('quantity');
            $totalCost = $productDamages->sum(function($d) {
                return $d->quantity * $d->cost_per_unit;
            });
            
            $product = $productDamages->first()->product;
            
            $summary[] = [
                'product_id' => $productId,
                'product_name' => $product->product_name,
                'total_damaged_quantity' => $totalQuantity,
                'total_damage_cost' => $totalCost,
                'records_count' => $productDamages->count(),
            ];
        }

        usort($summary, function($a, $b) {
            return $b['total_damage_cost'] <=> $a['total_damage_cost'];
        });

        return response()->json([
            'total_damages_recorded' => Damage::count(),
            'total_damage_cost' => Damage::get()->sum(function($d) {
                return $d->quantity * $d->cost_per_unit;
            }),
            'damages_by_product' => $summary
        ]);
    }
}
