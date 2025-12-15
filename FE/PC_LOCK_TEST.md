# PC Locking System - Cross-Window Test Guide

## 🎯 Overview
This system prevents multiple browser windows from using the same PC number simultaneously. When a user selects a PC number in one window, that PC becomes locked and unavailable to other windows in real-time.

## 🔥 Quick Demo Flow
```
Window 1                    Backend                     Window 2
────────                    ───────                     ────────
                                                        
1. Select PC-5              
2. Place Order    ────►    Order Created              
                           Broadcast: PC-5 locked       
                                          │             
                                          └────────►   3. PC-5 turns RED 🔴
                                                         "🔒 In Use" appears
                                                         Button DISABLED
                                                       
                                                       4. User selects PC-6
                                                         PC-6 turns BLUE 🟦
                                                         Button ENABLED ✅
                                                         
5. Complete Order ────►    Broadcast: PC-5 unlocked
                                          │
                                          └────────►   6. PC-5 turns GREEN ✅
                                                         Available again!
```

## How It Works

### 1. **Real-Time Broadcasting**
- When an order is placed with a PC number, a `OrderPlaced` event is broadcast via WebSocket
- All open windows receive this event and add the PC to their `lockedPCs` set
- When an order is completed or canceled, a `OrderReleased` event unlocks the PC

### 2. **Visual Indicators**
- **Red Border**: Input field turns red when a locked PC is selected
- **🔒 In Use**: Label appears next to the PC input
- **Warning Banner**: Red alert box shows when locked PC is selected
- **Disabled Button**: "Place Order" button is disabled for locked PCs
- **Available PCs**: Green text shows first 10 available PCs

### 3. **Validation Points**
- **onChange**: Shows alert when user types a locked PC number
- **confirmOrder**: Blocks order placement if PC is locked
- **canPlaceOrder**: Disables Place Order button if PC is locked

## Testing Instructions

### Test 1: Basic Lock/Unlock
1. Open the application in **Window 1**
2. Select PC-5 and place an order
3. Open the application in **Window 2** (new tab/window)
4. Try to select PC-5 → Should show:
   - Red border on input
   - "🔒 In Use" label
   - Warning alert popup
   - Red warning banner
   - Disabled "Place Order" button
5. In Window 2, select PC-6 instead → Should work normally
6. In Window 1, complete or cancel the PC-5 order
7. In Window 2, PC-5 should now become available (green)

### Test 2: Real-Time Updates
1. Open **3 windows** simultaneously
2. In Window 1: Select PC-10, place order
3. Check Window 2 & 3: PC-10 should appear in "In use by other windows" list
4. In Window 2: Select PC-11, place order
5. Check Window 1 & 3: Both PC-10 and PC-11 should show as locked
6. In Window 3: Try PC-12 → Should work fine
7. Complete order in Window 1 → PC-10 unlocks across all windows

### Test 3: Available PCs Display
1. Lock several PCs (e.g., 1, 5, 10, 15, 20)
2. Open a new window
3. Check the "Available PCs" section → Should show available PCs like: "2, 3, 4, 6, 7, 8, 9, 11, 12, 13"
4. Verify locked PCs show in orange: "In use by other windows: 1, 5, 10, 15, 20"

### Test 4: Session Persistence
1. Window 1: Select PC-7, place order
2. Close Window 1 (don't complete order)
3. Open new Window 2
4. PC-7 should still be locked (order is pending in database)
5. View "My Orders" for PC-7 to complete/cancel it

## Expected Behaviors

### ✅ When PC is Available
- White/dark background on input
- Brand color (blue/orange) on order number
- No warning messages
- "Place Order" button enabled

### ❌ When PC is Locked
- Red border and background on input
- Red text on order number with "(Unavailable)"
- "🔒 In Use" label visible
- Warning alert on selection
- Red warning banner above buttons
- "Place Order" button disabled
- PC number listed in "In use by other windows"

## Technical Details

### Frontend (SelectedSidebar.tsx)
- **lockedPCs**: Set tracking all currently locked PC numbers
- **WebSocket Events**: Listens to `OrderPlaced` and `OrderReleased`
- **Session ID**: Each window has unique session ID to track ownership
- **Validation**: Triple-layer validation (onChange, visual, confirmOrder)

### Backend (Laravel)
- **OrderPlaced Event**: Broadcasts when order created
- **OrderReleased Event**: Broadcasts when order completed/canceled
- **PcSessionController**: Manages PC locking via Cache
- **Routes**: `/pc-session/claim`, `/pc-session/release`, `/pc-session/locked`

## Troubleshooting

### Issue: PCs not unlocking after order completion
- **Check**: Ensure `OrderReleased` event is properly broadcast
- **Fix**: Complete order from admin panel or cancel via API

### Issue: Multiple windows can use same PC
- **Check**: WebSocket connection (Laravel Echo must be running)
- **Fix**: Start broadcasting service: `php artisan queue:work`

### Issue: All PCs show as locked
- **Check**: Clear cache: `php artisan cache:clear`
- **Fix**: Restart Laravel and check Redis/broadcasting config

## Architecture Flow

```
Window 1: Select PC-5 → Place Order
    ↓
Backend: Create order with pc_number=5
    ↓
Backend: Broadcast OrderPlaced(pc_number: 5, session_id: xxx)
    ↓
WebSocket: Push event to all connected clients
    ↓
Window 2,3,4...: Receive event → Add 5 to lockedPCs
    ↓
Window 2: User tries PC-5 → Blocked (red UI, disabled button)
    ↓
Window 1: Complete order
    ↓
Backend: Broadcast OrderReleased(pc_number: 5)
    ↓
All Windows: Remove 5 from lockedPCs → PC-5 available again
```

## Success Criteria
✅ PC numbers lock in real-time across all windows
✅ Visual indicators clearly show locked/available status
✅ Users cannot place orders for locked PCs
✅ PCs automatically unlock when orders are completed
✅ System works across multiple browser tabs and windows
