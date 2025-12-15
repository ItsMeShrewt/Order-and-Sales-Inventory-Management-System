# 🎯 PC Locking Quick Reference

## What It Does
Prevents multiple browser windows from using the same PC number at the same time.

## How to Test (30 seconds)
1. Open page → Select PC-5 → Place order
2. Open new tab → Try PC-5
3. See: 🔴 Red input, 🔒 In Use label, Disabled button
4. Change to PC-6 → ✅ Works!

## Visual Indicators

| Status | Input Color | Label | Button | Alert |
|--------|-------------|-------|--------|-------|
| Available | 🟦 Blue/White | - | ✅ Enabled | - |
| Locked | 🟥 Red | 🔒 In Use | ❌ Disabled | ⚠️ Warning |

## What Happens When...

### ...Window 1 places order for PC-5
- ✅ Order placed successfully
- 📡 Broadcasts to all windows
- 🔒 PC-5 locked everywhere

### ...Window 2 tries to use PC-5
- ❌ Input turns red
- ⚠️ Alert: "PC-5 is in use. Try: 1, 2, 3, 6..."
- 🚫 Place Order button disabled
- 💡 Shows available PCs

### ...Order is completed
- ✅ PC-5 unlocked
- 📡 Broadcasts release
- 🔓 Available in all windows instantly

## Key Features
- ⚡ **Real-time**: Updates across all windows instantly
- 🎨 **Visual**: Red/blue colors, icons, labels
- 🔒 **4-Layer Protection**: Alert → Visual → Button → Backend
- 💡 **Helpful**: Shows available PCs
- 🚀 **Fast**: WebSocket broadcasting
- 🔄 **Smart Release**: Auto-releases PC when window closes (if no order placed) 🆕
- ⏱️ **Auto-Expiry**: Temporary claims expire after 1 hour 🆕

## Files Changed
- `FE/src/layout/SelectedSidebar.tsx` ← Main changes

## Docs
- `PC_LOCK_IMPLEMENTATION.md` ← Full details
- `PC_LOCK_TEST.md` ← Testing guide
- `PC_LOCK_VISUAL.md` ← Visual mockups

---
**Status**: ✅ Fully implemented and ready to test!
