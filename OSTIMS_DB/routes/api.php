<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;

// Authentication (public)
Route::post('/login', [AuthController::class, 'login']);

// Public read endpoints used by the customer UI (no auth required)
Route::get('/products', [App\Http\Controllers\ProductController::class, 'index']);
Route::get('/products/best-sellers', [App\Http\Controllers\ProductController::class, 'bestSellers']);
Route::get('/inventories', [App\Http\Controllers\InventoryController::class, 'index']);
Route::get('/categories', [App\Http\Controllers\CategoryController::class, 'index']);
// Allow guests to place orders (public)
Route::post('/orders', [App\Http\Controllers\OrderController::class, 'store']);
// Allow guests to view their own orders by PC number (public)
Route::get('/orders/by-pc/{pcNumber}', [App\Http\Controllers\OrderController::class, 'getByPcNumber']);
// Allow guests to view their pending orders by session id (public)
Route::get('/orders/by-session/{sessionId}', [App\Http\Controllers\OrderController::class, 'getBySession']);

// Public PC session locking endpoints
Route::post('/pc-session/claim', [App\Http\Controllers\PcSessionController::class, 'claim']);
Route::post('/pc-session/release', [App\Http\Controllers\PcSessionController::class, 'release']);
Route::get('/pc-session/locked', [App\Http\Controllers\PcSessionController::class, 'locked']);

// All other API routes are protected by sanctum auth
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // Category Routes (write operations protected)
    Route::post('/categories', [App\Http\Controllers\CategoryController::class, 'store']);
    Route::put('/categories/{id}', [App\Http\Controllers\CategoryController::class, 'update']);
    Route::delete('/categories/{id}', [App\Http\Controllers\CategoryController::class, 'destroy']);

    // Inventory Routes (create/update protected)
    Route::post('/inventories', [App\Http\Controllers\InventoryController::class, 'store']);
    Route::put('/inventories/{id}', [App\Http\Controllers\InventoryController::class, 'update']);

    // Product Routes (create/update/archival protected)
    Route::get('/products/archived', [App\Http\Controllers\ProductController::class, 'archived']);
    Route::post('/products', [App\Http\Controllers\ProductController::class, 'store']);
    Route::put('/products/{id}', [App\Http\Controllers\ProductController::class, 'update']);
    Route::patch('/products/{id}/archive', [App\Http\Controllers\ProductController::class, 'archive']);
    Route::patch('/products/{id}/unarchive', [App\Http\Controllers\ProductController::class, 'unarchive']);
    Route::patch('/products/{id}/toggle-best-seller', [App\Http\Controllers\ProductController::class, 'toggleBestSeller']);

    // Order Routes (admin / protected - order listing, confirm, show, update, cancel)
    Route::get('/orders', [App\Http\Controllers\OrderController::class, 'index']);
    Route::get('/orders/completed', [App\Http\Controllers\OrderController::class, 'completed']);
    Route::post('/orders/{id}/confirm', [App\Http\Controllers\OrderController::class, 'confirm']);
    Route::get('/orders/{id}', [App\Http\Controllers\OrderController::class, 'show']);
    Route::put('/orders/{id}', [App\Http\Controllers\OrderController::class, 'update']);
    Route::patch('/orders/{id}/cancel', [App\Http\Controllers\OrderController::class, 'cancel']);

    // Order Items Routes
    Route::get('/order-items', [App\Http\Controllers\OrderItemsController::class, 'index']);
    Route::post('/order-items', [App\Http\Controllers\OrderItemsController::class, 'store']);
    Route::get('/order-items/{id}', [App\Http\Controllers\OrderItemsController::class, 'show']);
    Route::put('/order-items/{id}', [App\Http\Controllers\OrderItemsController::class, 'update']);
    Route::delete('/order-items/{id}', [App\Http\Controllers\OrderItemsController::class, 'destroy']);

    // Nested Route: Delete order-item from specific order (validates order belongs to item)
    Route::delete('/orders/{order_id}/order-items/{order_item_id}', [App\Http\Controllers\OrderItemsController::class, 'destroyFromOrder']);

    // Bundle Products Routes
    Route::post('/bundle-products', [App\Http\Controllers\BundleProductController::class, 'store']);
    Route::get('/bundle-products/{productId}', [App\Http\Controllers\BundleProductController::class, 'show']);
    Route::delete('/bundle-products/{id}', [App\Http\Controllers\BundleProductController::class, 'destroy']);

    // Sales Routes
    Route::get('/sales', [App\Http\Controllers\SalesController::class, 'index']);
    Route::get('/sales/monthly', [App\Http\Controllers\SalesController::class, 'monthly']);
    Route::get('/sales/monthly-details', [App\Http\Controllers\SalesController::class, 'monthlyDetails']);
    Route::post('/sales', [App\Http\Controllers\SalesController::class, 'store']);
    Route::post('/sales/cleanup-orphaned', [App\Http\Controllers\SalesController::class, 'cleanupOrphaned']);
    Route::get('/sales/{id}', [App\Http\Controllers\SalesController::class, 'show']);

    // Damage Reports Routes
    Route::get('/damages', [App\Http\Controllers\DamageController::class, 'index']);
    Route::get('/damages/report/summary', [App\Http\Controllers\DamageController::class, 'reportSummary']);
    Route::get('/damages/{id}', [App\Http\Controllers\DamageController::class, 'show']);
    Route::post('/damages', [App\Http\Controllers\DamageController::class, 'store']);
});
