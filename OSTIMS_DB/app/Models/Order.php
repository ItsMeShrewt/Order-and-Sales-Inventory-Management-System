<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';
    protected $fillable = [
        'order_date',
        'total_amount',
        'order_alias',
        'session_id',
        'transaction_number',
    ];

    public function orderItems()
    {
        return $this->hasMany(OrderItems::class);
    }

    public function sale()
    {
        return $this->hasOne(Sales::class);
    }
}
