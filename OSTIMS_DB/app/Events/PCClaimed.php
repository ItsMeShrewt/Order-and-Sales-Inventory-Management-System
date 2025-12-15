<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PCClaimed implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $pc_number;
    public $session_id;

    public function __construct($pc_number, $session_id)
    {
        $this->pc_number = $pc_number;
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
            'session_id' => $this->session_id,
        ];
    }

    public function broadcastAs()
    {
        return 'PCClaimed';
    }
}
