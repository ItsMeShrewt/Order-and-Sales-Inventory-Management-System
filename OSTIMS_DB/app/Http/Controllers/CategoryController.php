<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Category;
use App\Http\Requests\UpdateCategoryRequest;

class CategoryController extends Controller
{
    // GET /api/categories
    public function index()
    {
        // return categories along with a quick products_count for UI safety checks
        $categories = Category::withCount('products')->orderBy('id', 'asc')->get();
        return response()->json($categories);
    }

    // POST /api/categories
    public function store(Request $request)
    {
        // Validate request
        $validatedData = $request->validate([
            'category' => 'required|string|unique:categories,category_name',
        ]);

        // Create category
        $category = Category::create([
            'category_name' => $validatedData['category'],
        ]);

        // Return JSON response
        return response()->json([
            'message' => 'Category added successfully',
            'category' => $category
        ], 201);
    }

        // PUT /api/categories/{id}
    public function update(UpdateCategoryRequest $request, $id)
    {
        // Find category or fail
        $category = Category::findOrFail($id);

        // Update using validated data
        $category->update([
            'category_name' => $request->validated()['category'],
        ]);

        return response()->json([
            'message' => 'Category updated successfully',
            'category' => $category
        ]);
    }

    // DELETE /api/categories/{id}
    public function destroy($id)
    {
        $category = Category::findOrFail($id);

        // Prevent deletion if there are products attached to this category
        $hasProducts = $category->products()->exists();
        if ($hasProducts) {
            return response()->json([
                'message' => 'Cannot delete category: there are products assigned to this category. Reassign or remove products first.'
            ], 400);
        }

        $category->delete();

        return response()->json([
            'message' => 'Category deleted successfully',
        ]);
    }
}
