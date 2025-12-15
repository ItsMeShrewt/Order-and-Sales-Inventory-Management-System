<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $table = 'products';
    protected $fillable = [
        'category_id',
        'product_name',
        'price',
        'image',
        'status',
        'is_best_seller',
        'is_stockable',
    ];

    protected $casts = [
        'is_stockable' => 'boolean',
    ];

    public function category()
    {
        return $this->belongsTo(Category::class); // foreign key: category_id
    }

    public function bundleItems()
    {
        return $this->hasMany(BundleProduct::class, 'product_id');
    }

    public function isBundle()
    {
        return $this->bundleItems()->exists();
    }
}
