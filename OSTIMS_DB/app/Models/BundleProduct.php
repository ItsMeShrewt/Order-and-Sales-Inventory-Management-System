<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BundleProduct extends Model
{
    protected $table = 'bundle_products';
    
    protected $fillable = [
        'product_id',
        'bundled_product_id',
        'quantity',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function bundledProduct()
    {
        return $this->belongsTo(Product::class, 'bundled_product_id');
    }
}
