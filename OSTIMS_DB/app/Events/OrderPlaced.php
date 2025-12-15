<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderPlaced implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $pc_number;
    public $order_id;
    public $session_id;

    public function __construct($pc_number, $order_id, $session_id = null)
    {
        $this->pc_number = $pc_number;
        $this->order_id = $order_id;
        $this->session_id = $session_id;
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
            'session_id' => $this->session_id,
        ];
    }

    public function broadcastAs()
    {
        return 'OrderPlaced';
    }
}
