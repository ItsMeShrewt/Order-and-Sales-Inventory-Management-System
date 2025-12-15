<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class PcSessionController extends Controller
{
    // Claim a PC number for a session
    public function claim(Request $request)
    {
        $pcNumber = $request->input('pc_number');
        $sessionId = $request->input('session_id') ?? Str::uuid()->toString();
        if (!$pcNumber) {
            return response()->json(['error' => 'Missing pc_number'], 400);
        }
        $key = "pc_lock_{$pcNumber}";
        $existing = Cache::get($key);
        if ($existing && $existing !== $sessionId) {
            return response()->json(['error' => 'PC already locked', 'locked_by' => $existing], 409);
        }
        Cache::put($key, $sessionId, now()->addMinutes(60));
        
        // Broadcast PC claim event so other windows can mark it as locked
        try {
            event(new \App\Events\PCClaimed($pcNumber, $sessionId));
        } catch (\Throwable $e) {
            // ignore broadcast errors
        }
        
        return response()->json(['success' => true, 'session_id' => $sessionId]);
    }

    // Release a PC number
    public function release(Request $request)
    {
        $pcNumber = $request->input('pc_number');
        $sessionId = $request->input('session_id');
        if (!$pcNumber || !$sessionId) {
            return response()->json(['error' => 'Missing pc_number or session_id'], 400);
        }
        $key = "pc_lock_{$pcNumber}";
        $existing = Cache::get($key);
        if ($existing === $sessionId) {
            Cache::forget($key);
            return response()->json(['success' => true]);
        }
        return response()->json(['error' => 'Session does not own lock'], 403);
    }

    // List all locked PCs
    public function locked()
    {
        $locked = [];
        for ($i = 1; $i <= 35; $i++) {
            $key = "pc_lock_{$i}";
            $sessionId = Cache::get($key);
            if ($sessionId) {
                $locked[$i] = $sessionId;
            }
        }
        return response()->json($locked);
    }
}
