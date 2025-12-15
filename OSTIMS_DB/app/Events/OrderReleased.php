<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderReleased implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $pc_number;
    public $order_id;

    public function __construct($pc_number, $order_id = null)
    {
        $this->pc_number = $pc_number;
        $this->order_id = $order_id;
    }

    public function broadcastOn()
    {
        return new Channel('pc-user');
    }

    public function broadcastWith()
    {
        return [
            'pc_number' => $this->pc_number,
            'order_id' => $this->order_id,
        ];
    }

    public function broadcastAs()
    {
        return 'OrderReleased';
    }
}
