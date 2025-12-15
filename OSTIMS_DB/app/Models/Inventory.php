<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Inventory extends Model
{
    protected $table = 'inventories';
    protected $fillable = [
        'product_id',
        'quantity',
        'type',
        'source',
    ];
    
    public $timestamps = true;

    public function product()
    {
        return $this->belongsTo(Product::class); // foreign key: product_id
    }
}
