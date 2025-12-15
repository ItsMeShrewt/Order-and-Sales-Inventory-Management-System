<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BundleProduct;

class BundleProductController extends Controller
{
    // POST /api/bundle-products
    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'bundled_product_id' => 'required|exists:products,id',
            'quantity' => 'required|integer|min:1',
        ]);

        $bundleProduct = BundleProduct::create($validated);

        return response()->json($bundleProduct, 201);
    }

    // GET /api/bundle-products/{productId}
    public function show($productId)
    {
        $bundleProducts = BundleProduct::with('bundledProduct')
            ->where('product_id', $productId)
            ->get();

        return response()->json($bundleProducts);
    }

    // DELETE /api/bundle-products/{id}
    public function destroy($id)
    {
        $bundleProduct = BundleProduct::findOrFail($id);
        $bundleProduct->delete();

        return response()->json(['message' => 'Bundle product deleted successfully']);
    }
}
