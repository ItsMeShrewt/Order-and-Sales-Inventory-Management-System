<?php

namespace App\Services;

use App\Models\Order;
use Carbon\Carbon;

class TransactionNumberService
{
    /**
     * Generate a transaction number in the format:
     * For PC orders: MMTTJJ-PC##-SEQ##
     * For Walk-In: MMTTJJ-WI-SEQ##
     * MMTTJJ = German style date: Month, Day, Year (e.g., 121225 for December 12, 2025)
     * PC## = PC number (zero-padded to 2 digits)
     * SEQ## = Sequential number for this day (zero-padded to 2 digits)
     *
     * @param string|int $pcNumber The PC station number or "WI" for walk-in
     * @return string
     */
    public static function generateTransactionNumber($pcNumber): string
    {
        $now = Carbon::now();
        
        // Get sequential number for this day
        $seqNumber = self::getSequentialNumber($now);
        $seq = str_pad($seqNumber, 2, '0', STR_PAD_LEFT);
        
        // MMTTJJ format (German style: month + day + year, all 2 digits)
        $mmttjj = $now->format('mdy');  // e.g., 121225 for Dec 12, 2025
        
        // Check if it's a walk-in order
        if (strtoupper($pcNumber) === 'WI' || $pcNumber === 'PC-WI') {
            return "{$mmttjj}-WI-SEQ{$seq}";
        }
        
        // Pad PC number to 2 digits
        $pc = str_pad($pcNumber, 2, '0', STR_PAD_LEFT);
        
        return "{$mmttjj}-PC{$pc}-SEQ{$seq}";
    }
    
    /**
     * Get the sequential number for orders created today
     * Resets to 1 at the start of each new day
     *
     * @param Carbon $date
     * @return int
     */
    private static function getSequentialNumber(Carbon $date): int
    {
        $startOfDay = $date->clone()->startOfDay();
        $endOfDay = $date->clone()->endOfDay();
        
        // Count orders created today only (excluding those without transaction_number yet)
        $count = Order::whereBetween('created_at', [$startOfDay, $endOfDay])
                     ->whereNotNull('transaction_number')
                     ->count();
        
        // Return the next sequence number (count + 1)
        // This automatically resets to 1 at the start of each new day
        return $count + 1;
    }
}
