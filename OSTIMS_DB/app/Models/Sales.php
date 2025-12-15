<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sales extends Model
{
    protected $table = 'sales';
    protected $fillable = [
        'total_amount',
        'total_order',
        'sale_date',
        'order_id',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
