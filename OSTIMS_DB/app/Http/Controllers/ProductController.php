<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Product;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Requests\StoreProductRequest;

class ProductController extends Controller
{
    // GET /api/products
    public function index()
    {
        // Get all products including archived ones (frontend needs to check ingredient status)
        $products = Product::with(['category', 'bundleItems.bundledProduct'])
            ->orderBy('id', 'asc')
            ->get();

        // Attach an `image_url` attribute and bundle info for each product
        $products->transform(function ($product) {
            $product->image_url = $product->image ? Storage::url($product->image) : null;
            $product->is_bundle = $product->bundleItems->isNotEmpty();
            $product->bundle_items = $product->bundleItems->map(function ($bundleItem) {
                return [
                    'product_id' => $bundleItem->bundled_product_id,
                    'product_name' => $bundleItem->bundledProduct->product_name,
                    'quantity' => $bundleItem->quantity,
                    'status' => $bundleItem->bundledProduct->status, // Include status for archived check
                ];
            });
            
            // Calculate bundle stock based on component products
            if ($product->is_bundle) {
                $product->calculated_stock = $this->calculateBundleStock($product);
            }
            
            return $product;
        });

        return response()->json($products)
            ->header('Cache-Control', 'no-cache, no-store, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    // POST /api/products
    public function store(StoreProductRequest $request)
    {
        $validatedData = $request->validated();

        if ($request->hasFile('image')) {
            // store on the public disk under 'products' directory
            try {
                $file = $request->file('image');
                // Log file details for debugging
                logger()->info('Attempting to store image:', [
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getClientMimeType(),
                    'size' => $file->getSize(),
                ]);
                
                // Ensure products directory exists
                if (!Storage::disk('public')->exists('products')) {
                    Storage::disk('public')->makeDirectory('products');
                }
                $path = $file->store('products', 'public');
                $validatedData['image'] = $path; // e.g. 'products/abc.jpg'
                logger()->info('Image stored successfully:', ['path' => $path]);
            } catch (\Throwable $e) {
                // If PHP failed to create a temporary file (permissions/disk), return helpful payload
                logger()->error('Product image upload failed: ' . $e->getMessage(), [
                    'trace' => $e->getTraceAsString()
                ]);
                // If the client provided a base64 image payload try storing that instead
                if ($request->filled('image_base64')) {
                    try {
                        $saved = $this->storeBase64Image($request->input('image_base64'));
                        if ($saved) $validatedData['image'] = $saved;
                    } catch (\Throwable $e2) {
                        logger()->error('Product image upload (base64) failed: ' . $e2->getMessage());
                        return response()->json([
                            'message' => 'The image failed to upload.',
                            'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                        ], 422);
                    }
                } else {
                    return response()->json([
                        'message' => 'The image failed to upload.',
                        'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                    ], 422);
                }
            }
        }

        // If caller did not provide a status, set new products to no-stock
        // by default so they surface as 'Out of Stock' in the UI until
        // inventory records are added.
        if (!array_key_exists('status', $validatedData) || !$validatedData['status']) {
            $validatedData['status'] = 'out_of_stock';
        }

        // If client sent image_base64 directly (our frontend fallback), accept it here
        if (!$request->hasFile('image') && $request->filled('image_base64')) {
            try {
                $saved = $this->storeBase64Image($request->input('image_base64'));
                if ($saved) $validatedData['image'] = $saved;
            } catch (\Throwable $e) {
                logger()->error('Product image upload (base64) failed (store pre-create): ' . $e->getMessage());
                return response()->json([
                    'message' => 'The image failed to upload.',
                    'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                ], 422);
            }
        }

        $product = Product::create($validatedData);

        // include relationship and image url
        $product->load('category');
        $product->image_url = $product->image ? Storage::url($product->image) : null;

        return response()->json([
            'message' => 'Product created successfully',
            'product' => $product
        ], 201);
    }

    // PUT /api/products/{id}
    public function update(UpdateProductRequest $request, $id)
    {
        $product = Product::findOrFail($id);
        $validatedData = $request->validated();

        if ($request->hasFile('image')) {
            // delete old image if it exists on the public disk
            if ($product->image && Storage::disk('public')->exists($product->image)) {
                Storage::disk('public')->delete($product->image);
            }

            try {
                $file = $request->file('image');
                // Log file details for debugging
                logger()->info('Attempting to store image (update):', [
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getClientMimeType(),
                    'size' => $file->getSize(),
                ]);
                
                // Ensure products directory exists
                if (!Storage::disk('public')->exists('products')) {
                    Storage::disk('public')->makeDirectory('products');
                }
                $path = $file->store('products', 'public');
                $validatedData['image'] = $path;
                logger()->info('Image stored successfully (update):', ['path' => $path]);
            } catch (\Throwable $e) {
                logger()->error('Product image upload failed (update): ' . $e->getMessage(), [
                    'trace' => $e->getTraceAsString()
                ]);
                if ($request->filled('image_base64')) {
                    try {
                        $saved = $this->storeBase64Image($request->input('image_base64'));
                        if ($saved) $validatedData['image'] = $saved;
                    } catch (\Throwable $e2) {
                        logger()->error('Product image upload (base64) failed (update): ' . $e2->getMessage());
                        return response()->json([
                            'message' => 'The image failed to upload.',
                            'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                        ], 422);
                    }
                } else {
                    return response()->json([
                        'message' => 'The image failed to upload.',
                        'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                    ], 422);
                }
            }
        }

        // If client supplied a base64 image instead of a multipart file, store it and assign to validated data
        if (!$request->hasFile('image') && $request->filled('image_base64')) {
            try {
                // delete old image first
                if ($product->image && Storage::disk('public')->exists($product->image)) {
                    Storage::disk('public')->delete($product->image);
                }
                $saved = $this->storeBase64Image($request->input('image_base64'));
                if ($saved) $validatedData['image'] = $saved;
            } catch (\Throwable $e) {
                logger()->error('Product image upload (base64) failed (update pre-update): ' . $e->getMessage());
                return response()->json([
                    'message' => 'The image failed to upload.',
                    'errors' => ['image' => ["The image failed to upload. Reason: " . $e->getMessage()]]
                ], 422);
            }
        }

        $product->update($validatedData);

        $product->load('category');
        $product->image_url = $product->image ? Storage::url($product->image) : null;

        return response()->json([
            'message' => 'Product updated successfully',
            'product' => $product
        ]);
    }

    /**
     * Accept a base64 image payload and write it to the public disk.
     * Returns the stored path (e.g. 'products/abc.jpg') on success.
     * Throws on failure.
     */
    private function storeBase64Image(string $base64)
    {
        // data URL or straight base64 content
        if (preg_match('/^data:(image\/[^;]+);base64,(.+)$/', $base64, $m)) {
            $mime = $m[1];
            $data = $m[2];
        } else {
            // assume PNG if not specified
            $mime = 'image/png';
            $data = $base64;
        }

        $decoded = base64_decode($data);
        if ($decoded === false) {
            throw new \RuntimeException('Base64 decode failed');
        }

        $ext = explode('/', $mime)[1] ?? 'png';
        $filename = 'products/' . uniqid('img_', true) . '.' . preg_replace('/[^a-z0-9]/i', '', $ext);

        $stored = Storage::disk('public')->put($filename, $decoded);
        if ($stored) return $filename;
        throw new \RuntimeException('Failed to store decoded base64 image');
    }

    /**
     * Process and store an uploaded image file.
     * For JPG files, just save them as-is.
     */
    private function processAndStoreImage($uploadedFile)
    {
        try {
            $extension = strtolower($uploadedFile->getClientOriginalExtension());
            $filename = 'products/' . uniqid('img_', true) . '.' . $extension;
            
            // Read and save the file as-is
            $fileContents = file_get_contents($uploadedFile->getRealPath());
            $stored = Storage::disk('public')->put($filename, $fileContents);
            
            if ($stored) {
                return $filename;
            }
            throw new \RuntimeException('Failed to store image');
        } catch (\Throwable $e) {
            logger()->error('Image storage error: ' . $e->getMessage());
            // Fallback: just store with a different approach
            $filename = 'products/' . uniqid('img_', true) . '.' . $uploadedFile->getClientOriginalExtension();
            $stored = Storage::disk('public')->put($filename, file_get_contents($uploadedFile->getRealPath()));
            if ($stored) return $filename;
            throw new \RuntimeException('Failed to store image after fallback');
        }
    }

    // PATCH /api/products/{id}/archive
    public function archive($id)
    {
        $product = Product::findOrFail($id);
        $product->update(['status' => 'archived']);

        return response()->json([
            'message' => 'Product archived successfully',
            'product' => $product
        ]);
    }

    // GET /api/products/archived
    public function archived()
    {
        $products = Product::where('status', 'archived')
            ->with('category')
            ->orderBy('id', 'asc')
            ->get();

        // attach image_url for each product
        $products->transform(function ($product) {
            $product->image_url = $product->image ? Storage::url($product->image) : null;
            return $product;
        });

        return response()->json($products);
    }

    // PATCH /api/products/{id}/unarchive
    public function unarchive($id)
    {
        $product = Product::findOrFail($id);

    // set status back to 'active' (unarchived). Migration defines default as 'active'.
    $product->update(['status' => 'active']);

        $product->load('category');
        $product->image_url = $product->image ? Storage::url($product->image) : null;

        return response()->json([
            'message' => 'Product unarchived successfully',
            'product' => $product
        ]);
    }

    // GET /api/products/best-sellers
    public function bestSellers()
    {
        // Calculate best sellers based on actual order data
        // Get products with the highest total quantity ordered
        $products = DB::table('order_items')
            ->select(
                'products.id',
                'products.product_name',
                'products.category_id',
                'products.price',
                'products.image',
                'products.status',
                'products.is_best_seller',
                'products.created_at',
                'products.updated_at',
                DB::raw('SUM(order_items.quantity) as total_sold')
            )
            ->join('products', 'order_items.product_id', '=', 'products.id')
            ->where('products.status', '!=', 'archived')
            ->groupBy(
                'products.id',
                'products.product_name',
                'products.category_id',
                'products.price',
                'products.image',
                'products.status',
                'products.is_best_seller',
                'products.created_at',
                'products.updated_at'
            )
            ->orderBy('total_sold', 'desc')
            ->limit(10)
            ->get();

        // Convert to collection and load relationships
        $productIds = $products->pluck('id');
        $productsWithRelations = Product::with('category')
            ->whereIn('id', $productIds)
            ->get()
            ->keyBy('id');

        // Merge the total_sold data and add image_url
        $results = $products->map(function ($item) use ($productsWithRelations) {
            $product = $productsWithRelations->get($item->id);
            if ($product) {
                $product->total_sold = $item->total_sold;
                $product->image_url = $product->image ? Storage::url($product->image) : null;
                return $product;
            }
            return null;
        })->filter();

        return response()->json($results->values())
            ->header('Cache-Control', 'no-cache, no-store, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    // PATCH /api/products/{id}/toggle-best-seller
    public function toggleBestSeller($id)
    {
        $product = Product::findOrFail($id);
        $product->update(['is_best_seller' => !$product->is_best_seller]);

        return response()->json([
            'message' => 'Best seller status updated',
            'product' => $product,
            'is_best_seller' => $product->is_best_seller
        ]);
    }

    /**
     * Calculate available stock for a bundle product based on component products
     * Returns the maximum number of bundles that can be made
     */
    private function calculateBundleStock($product)
    {
        if (!$product->bundleItems || $product->bundleItems->isEmpty()) {
            return 0;
        }

        $minStock = null;

        foreach ($product->bundleItems as $bundleItem) {
            $bundledProduct = $bundleItem->bundledProduct;
            
            // Skip non-stockable products (they don't limit bundle availability)
            if (!$bundledProduct->is_stockable) {
                continue;
            }

            // Get the total inventory stock for this product (sum all inventory entries)
            $availableStock = DB::table('inventories')
                ->where('product_id', $bundledProduct->id)
                ->sum('quantity');
            
            // Calculate how many bundles can be made with this component
            // (available stock / quantity needed per bundle)
            $possibleBundles = floor($availableStock / $bundleItem->quantity);
            
            // Track the minimum (bottleneck)
            if ($minStock === null || $possibleBundles < $minStock) {
                $minStock = $possibleBundles;
            }
        }

        // If all components are non-stockable, return a high number (unlimited)
        return $minStock ?? 999;
    }

    // GET /api/products/{id}/bundle-items
}
