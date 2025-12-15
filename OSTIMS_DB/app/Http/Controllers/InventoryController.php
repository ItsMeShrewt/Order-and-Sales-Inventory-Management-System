<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreInventoryRequest;
use Illuminate\Http\Request;
use App\Models\Inventory;
use App\Http\Requests\UpdateInventoryRequest;

class InventoryController extends Controller
{
    // GET /api/inventories
    public function index()
    {
        $inventories = Inventory::with('product')->orderBy('id', 'asc')->get();
        return response()->json($inventories)
            ->header('Cache-Control', 'no-cache, no-store, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    // POST /api/inventories
    public function store(StoreInventoryRequest $request)
    {
        $validatedData = $request->validated();

        $inventory = Inventory::create($validatedData);

        return response()->json([
            'message' => 'Inventory record created successfully',
            'inventory' => $inventory
        ], 201);
    }

        // PUT /api/inventories/{id}
    public function update(UpdateInventoryRequest $request, $id)
    {
        $inventory = Inventory::findOrFail($id);
        $validatedData = $request->validated();

        $inventory->update($validatedData);

        return response()->json([
            'message' => 'Inventory updated successfully',
            'inventory' => $inventory
        ]);
    }
}
