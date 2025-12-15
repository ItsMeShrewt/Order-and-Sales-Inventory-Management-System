# 🔄 Window Close PC Release - Implementation Summary

## ✅ Problem Solved

**Original Issue**: When a user selects a PC number and closes their window/tab, that PC remains locked even though no one is using it.

**Solution**: Implemented a two-tier PC locking system:
1. **Temporary Claim** - When user adds items to cart
2. **Permanent Lock** - When order is actually placed in database

---

## 🎯 How It Works Now

### Scenario A: User Adds Items, Then Closes Window
```
1. User opens Window 1
2. Selects PC-5
3. Adds items to cart
   └─► PC-5 temporarily claimed (cache, 1 hour TTL)
4. Window 1 closed
   └─► PC-5 automatically released ✅
5. Window 2 can now use PC-5 immediately
```

### Scenario B: User Places Order, Then Closes Window  
```
1. User opens Window 1
2. Selects PC-5
3. Adds items to cart
   └─► PC-5 temporarily claimed
4. Places order
   └─► PC-5 locked in database (permanent)
5. Window 1 closed
   └─► PC-5 stays locked ✅ (order pending)
6. Window 2 CANNOT use PC-5 (order not completed yet)
7. Admin/User completes order
   └─► PC-5 unlocked and available
```

---

## 🔧 Technical Implementation

### 1. Temporary PC Claiming (Cart Phase)
```typescript
// Claim PC when user has items in cart
useEffect(() => {
  const claimPC = async () => {
    if (hasOrders && orderPrefix) {
      await api.post('/pc-session/claim', {
        pc_number: orderPrefix,
        session_id: sessionId,
      });
    }
  };
  
  // Debounce: claim after 1 second of inactivity
  const timeout = setTimeout(claimPC, 1000);
  return () => clearTimeout(timeout);
}, [hasOrders, orderPrefix]);
```

**When**: User has items in cart
**Duration**: 1 hour (cache TTL)
**Storage**: Redis/Cache (backend)
**Released**: Window close OR cart cleared OR order placed

### 2. Window Close Handler
```typescript
useEffect(() => {
  const handleUnload = () => {
    if (orderPrefix && hasOrders) {
      // Cart has items but no order placed - release claim
      const blob = new Blob([JSON.stringify({
        session_id: sessionId,
        pc_number: orderPrefix,
      })], { type: 'application/json' });
      
      navigator.sendBeacon(
        `${api.defaults.baseURL}/pc-session/release`, 
        blob
      );
    }
  };
  
  window.addEventListener('unload', handleUnload);
  window.addEventListener('pagehide', handleUnload); // Mobile
  
  return () => {
    window.removeEventListener('unload', handleUnload);
    window.removeEventListener('pagehide', handleUnload);
  };
}, [orderPrefix, hasOrders]);
```

**Uses**: `navigator.sendBeacon` for reliability during page unload
**Triggers**: Window close, tab close, page navigation
**Mobile Support**: Also listens to `pagehide` event

### 3. Cart Clear Handler
```typescript
onClick={async () => {
  // Release PC claim when clearing cart
  if (orderPrefix && hasOrders) {
    await api.post('/pc-session/release', {
      pc_number: orderPrefix,
      session_id: sessionId,
    });
  }
  clearOrders();
}}
```

**When**: User clicks "Clear All" button
**Effect**: Immediately releases temporary PC claim

### 4. Enhanced Lock Fetching
```typescript
const fetchLockedPCs = async () => {
  const [ordersRes, sessionRes] = await Promise.all([
    api.get('/orders'),           // Database orders
    api.get('/pc-session/locked'), // Temporary claims
  ]);
  
  const locked = new Set();
  
  // Add from pending DB orders (permanent locks)
  for (const order of pendingOrders) {
    if (order.session_id !== sessionId) {
      locked.add(pcNumber);
    }
  }
  
  // Add from temporary session claims
  for (const [pcNum, sid] of Object.entries(sessionLocks)) {
    if (sid !== sessionId) {
      locked.add(pcNum);
    }
  }
  
  setLockedPCs(locked);
};
```

**Checks**: Both database orders AND cache claims
**Refresh**: Every 10 seconds automatically
**Excludes**: Own session's locks (don't lock yourself)

---

## 📊 State Transitions

```
┌─────────────────┐
│  PC Available   │
│  (No lock)      │
└────────┬────────┘
         │
         │ User adds items to cart
         ▼
┌─────────────────┐
│ Temporary Claim │ ◄──┐
│ (Cache, 1hr)    │    │
└────────┬────────┘    │
         │              │
         ├─────────────►│ Window closed
         │              │ OR cart cleared
         │              │
         │ User places order
         ▼
┌─────────────────┐
│ Permanent Lock  │
│ (DB order)      │
└────────┬────────┘
         │
         │ Admin completes order
         ▼
┌─────────────────┐
│  PC Available   │
│  (Released)     │
└─────────────────┘
```

---

## 🧪 Testing Scenarios

### Test 1: Window Close with Cart Items
```
1. Window 1: Select PC-7, add 3 items
   → PC-7 shows locked in Window 2 ✅

2. Close Window 1 (X button or Alt+F4)
   → PC-7 becomes available immediately

3. Window 2: Can now select PC-7 ✅
```

### Test 2: Window Close After Order Placed
```
1. Window 1: Select PC-7, add items, PLACE ORDER
   → Order created in database
   → PC-7 locked everywhere

2. Close Window 1
   → PC-7 still locked ✅ (order pending)

3. Window 2: Cannot use PC-7 (shows red) ✅

4. Admin: Complete the order
   → PC-7 unlocked everywhere ✅
```

### Test 3: Clear Cart
```
1. Window 1: Select PC-7, add items
   → PC-7 locked in Window 2

2. Window 1: Click "Clear All"
   → PC-7 released immediately

3. Window 2: PC-7 available again ✅
```

### Test 4: Refresh Page
```
1. Window 1: Select PC-7, add items
2. Press F5 (refresh)
   → Temporary claim released
   → On reload, locks are fetched fresh
3. Cart is empty (items lost - expected behavior)
4. PC-7 available again ✅
```

### Test 5: Browser Crash
```
1. Window 1: Select PC-7, add items
2. Browser crashes or force-quit
   → Temporary claim expires after 1 hour (cache TTL)
3. Until then, PC-7 shows as locked
4. After 1 hour, automatically available ✅
```

---

## 🎨 User Experience

### Visual States

#### Cart Empty, PC-5 Selected
```
PC - [  5  ]  ← Normal (no lock yet)
💡 Select PC number
Order Number: PC-5
```

#### Cart Has Items, PC-5 Claimed
```
PC - [  5  ]  ← Normal (claimed by this window)
💡 Select PC number
Order Number: PC-5

Window 2 sees:
PC - [  5  ] 🔒 In Use  ← RED border
```

#### Order Placed, PC-5 Locked
```
PC - [  5  ]  ← Locked in DB
Order placed successfully!

Window 2 sees:
PC - [  5  ] 🔒 In Use  ← RED border
⚠️ PC-5 has a pending order
```

---

## 🔐 Security & Reliability

### Race Condition Protection
```typescript
// Backend validates ownership
if (existing && existing !== sessionId) {
  return 409; // Conflict - already claimed
}
```

### Mobile Browser Support
```typescript
window.addEventListener('pagehide', handleUnload);
// Safari/iOS properly handles this event
```

### Network Failure Handling
```typescript
try {
  await api.post('/pc-session/release', ...);
} catch {
  // Silently fail - cache will expire anyway (1hr)
}
```

### Auto-Expiry
- Temporary claims expire after 1 hour
- Prevents permanent locks from crashed/closed windows
- Backend cache handles cleanup automatically

---

## 📝 Files Modified

### Frontend
- ✅ `FE/src/layout/SelectedSidebar.tsx`
  - Added temporary PC claiming logic
  - Implemented window close handlers
  - Enhanced lock fetching to include cache claims
  - Added cart clear release logic

### Backend (Already Implemented)
- ✅ `PcSessionController.php` - Claim/Release endpoints
- ✅ Cache-based session management
- ✅ 1-hour TTL for automatic cleanup

---

## ✅ Success Criteria Met

- ✅ PC released when window closed (if no order placed)
- ✅ PC stays locked when window closed (if order exists)
- ✅ PC released when cart cleared
- ✅ Real-time updates across all windows
- ✅ Mobile browser support (pagehide event)
- ✅ Automatic expiry after 1 hour (cleanup)
- ✅ Race condition protection
- ✅ Clear visual feedback

---

## 🚀 Result

**Before**: Closing a window left PCs unnecessarily locked forever

**After**: Smart two-tier system:
- Temporary claims during cart building (released on close)
- Permanent locks for placed orders (require completion)

**User Experience**: Seamless PC availability management with automatic cleanup! 🎉
