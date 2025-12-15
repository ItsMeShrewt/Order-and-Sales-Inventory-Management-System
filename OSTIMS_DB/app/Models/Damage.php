<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Damage extends Model
{
    protected $table = 'damages';
    protected $fillable = [
        'product_id',
        'quantity',
        'cost_per_unit',
        'reason',
        'action_taken',
        'notes',
    ];

    protected $casts = [
        'cost_per_unit' => 'decimal:2',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
