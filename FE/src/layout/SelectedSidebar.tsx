import { X, Plus, Minus, ShoppingCart } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import api from "../lib/axios";
import Swal from "sweetalert2";
import { assignPcToTab, getTabPcNumber, cleanupTabPc } from "../lib/autoPc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "../components/ui/dialog";
import { useOrders, OrderItem } from "../context/OrderContext";
// ...existing code...

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  onPcNumberChange?: (pcNumber: string) => void;
  onSessionIdChange?: (sessionId: string) => void;
  adminMode?: boolean; // When true, completely bypasses all PC locking
}

const SelectedSidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, onPcNumberChange, onSessionIdChange, adminMode = false }) => {
    // Check if user is admin (has API token) OR if adminMode prop is true
    const [isAdmin] = useState(() => {
      if (adminMode) return true; // Force admin mode if prop is set
      const token = localStorage.getItem('api_token');
      return !!token;
    });
  
    // Generate a unique session ID for this browser window
    // Admin sessions are prefixed with 'admin_' to keep them separate
    const [sessionId] = useState(() => {
      const token = localStorage.getItem('api_token');
      const isAdminUser = !!token;
      
      if (isAdminUser) {
        // Admin gets a fresh session every time - never locked to any PC
        const adminSid = `admin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        try {
          sessionStorage.removeItem('active_pc');
          sessionStorage.removeItem('guest_session_id');
          sessionStorage.setItem('admin_session_id', adminSid);
          console.log('✅ Admin session created, no PC restrictions');
        } catch (e) {}
        return adminSid;
      } else {
        // Regular user session
        let sid = sessionStorage.getItem('guest_session_id');
        if (!sid) {
          sid = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          sessionStorage.setItem('guest_session_id', sid);
        }
        return sid;
      }
    });
  const { orders, updateQuantity, updateNotes, updateCookingPreferences, removeFromOrder, clearOrders } = useOrders();
  const hasOrders = orders && orders.length > 0;
  
  const [submitting, setSubmitting] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<{id: string; label: string}[]>([]);
  const [productStocks, setProductStocks] = useState<Record<number, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [bundleComponents, setBundleComponents] = useState<Record<number, Array<{id: number, quantity: number}>>>({});
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const [orderPrefix, setOrderPrefix] = useState<string>('');
  const [pcAssigned, setPcAssigned] = useState(false);

  // Auto-assign PC number with random delay to prevent race conditions
  useEffect(() => {
    if (pcAssigned) return;
    
    // Add random delay (0-100ms) to stagger tab assignments
    const delay = Math.floor(Math.random() * 100);
    const timer = setTimeout(() => {
      const autoPc = assignPcToTab();
      console.log('[SelectedSidebar] 🖥️ Auto-assigned PC-' + autoPc + ' to this tab');
      setOrderPrefix(autoPc);
      setPcAssigned(true);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [pcAssigned]);

  // Notify parent component when PC number or session ID changes
  useEffect(() => {
    if (onPcNumberChange) {
      onPcNumberChange(orderPrefix);
    }
    if (onSessionIdChange) {
      onSessionIdChange(sessionId);
    }
  }, [orderPrefix, sessionId, onPcNumberChange, onSessionIdChange]);
  
  // Continuously clear active_pc for admins - they can use any PC freely
  useEffect(() => {
    const isAdminSession = sessionId.startsWith('admin_');
    if (isAdmin || isAdminSession) {
      try {
        sessionStorage.removeItem('active_pc');
        console.log('🧹 Admin: Cleared active_pc (PC changed to', orderPrefix, ')');
      } catch (e) {}
    }
  }, [isAdmin, sessionId, orderPrefix]);
  
  // Only use backend to claim and lock PC number
  
  // Track scroll position to show/hide floating button
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setShowFloatingButton(scrollPosition > 200);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cleanup: Release PC assignment when tab closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupTabPc();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupTabPc();
    };
  }, []);

  // Sync orderPrefix to sessionStorage and localStorage whenever it changes
  useEffect(() => {
    if (orderPrefix && orderPrefix.trim()) {
      try {
        sessionStorage.setItem('active_pc', orderPrefix);
        localStorage.setItem('browser_last_selected_pc', orderPrefix);
        console.log('[SelectedSidebar] 🔄 Synced PC-' + orderPrefix + ' to storage (session + local)');
      } catch (err) {
        console.error('[SelectedSidebar] Error syncing PC to storage:', err);
      }
    }
  }, [orderPrefix]);

  // Listen for order:confirmed event to clear active_pc when this user's order is completed
  // This allows the user to select a new PC after their order is confirmed by staff
  useEffect(() => {
    // Admins don't need this - they can freely switch PCs
    if (isAdmin) return;

    const handleOrderConfirmed = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const confirmedPcNumber = detail?.pcNumber; // PC number from the confirmed order
      
      console.log('[SelectedSidebar] Order confirmed event received:', detail);
      
      // Get the current active PC for this window
      const activePc = sessionStorage.getItem('active_pc');
      
      // Only clear active_pc if the confirmed order's PC matches this window's active PC
      if (activePc && confirmedPcNumber && String(activePc) === String(confirmedPcNumber)) {
        console.log('[SelectedSidebar] ✅ Order confirmed for THIS window\'s PC (' + activePc + ')');
        
        // Wait a bit for the order to be fully processed, then check for remaining pending orders
        setTimeout(async () => {
          try {
            const res = await api.get(`/orders/by-session/${sessionId}`);
            const list = Array.isArray(res.data) ? res.data : res.data.data || [];
            
            // Filter for pending orders (not yet completed)
            const pendingOrders = list.filter((order: any) => !order.sale);
            
            console.log('[SelectedSidebar] Pending orders after confirmation:', pendingOrders.length);
            
            // If no more pending orders for this session, clear active_pc to allow new PC selection
            if (pendingOrders.length === 0) {
              sessionStorage.removeItem('active_pc');
              console.log('✅ [SelectedSidebar] All orders completed for PC-' + activePc + ' - CLEARED active_pc, user can now choose a different PC');
              
              // Dispatch event so other components know PC is unlocked
              window.dispatchEvent(new CustomEvent('pc:unlocked', { detail: { pcNumber: activePc } }));
            } else {
              console.log('ℹ️ [SelectedSidebar] Still has ' + pendingOrders.length + ' pending orders - keeping PC-' + activePc + ' locked');
            }
          } catch (err) {
            console.error('[SelectedSidebar] Error checking session orders:', err);
            // If we can't check, clear it anyway to be safe
            sessionStorage.removeItem('active_pc');
            console.log('⚠️ [SelectedSidebar] Error checking orders - cleared active_pc as safety measure');
          }
        }, 1000); // Wait 1 second for backend to process
      } else {
        console.log('[SelectedSidebar] ⏭️ Order NOT for this PC (confirmed: ' + confirmedPcNumber + ', active: ' + activePc + ')');
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      // Listen for cross-window order confirmations (both generic and PC-specific keys)
      if (e.key === 'order:confirmed' || e.key?.startsWith('order:confirmed:pc')) {
        console.log('[SelectedSidebar] Cross-window order:confirmed detected, key:', e.key);
        try {
          const data = e.newValue ? JSON.parse(e.newValue) : {};
          const activePc = sessionStorage.getItem('active_pc');
          const confirmedPc = String(data?.pcNumber || '');
          
          // Only process if it's for this window's PC
          if (activePc === confirmedPc) {
            console.log('[SelectedSidebar] ✅ Processing confirmation for THIS PC (PC-' + activePc + ')');
            handleOrderConfirmed(new CustomEvent('order:confirmed', { detail: data }));
          } else {
            console.log('[SelectedSidebar] ⏭️ Ignoring confirmation - not for this PC (for PC-' + confirmedPc + ', this is PC-' + activePc + ')');
          }
        } catch (err) {
          console.debug('[SelectedSidebar] Error parsing storage event:', err);
        }
      }
    };

    window.addEventListener('order:confirmed', handleOrderConfirmed as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('order:confirmed', handleOrderConfirmed as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [sessionId, isAdmin]);

  // Claim PC number temporarily when user has items in cart (skip for admins)
  // Release it when window closes (if no order was placed yet)
  useEffect(() => {
    // Admins don't need to claim PCs - they can use any PC
    if (isAdmin) return;
    
    let claimTimeout: NodeJS.Timeout | null = null;

    const claimPC = async () => {
      if (hasOrders && orderPrefix) {
        try {
          // Claim this PC temporarily while user is building their order
          await api.post('/pc-session/claim', {
            pc_number: orderPrefix,
            session_id: sessionId,
          });
          console.log(`✅ Claimed PC-${orderPrefix} for this window`);
        } catch (err: any) {
          if (err?.response?.status === 409) {
            // PC already claimed by another window
            console.log(`❌ PC-${orderPrefix} already claimed`);
          }
        }
      }
    };

    // Debounce claiming - only claim after user stops changing PC for 1 second
    if (hasOrders) {
      claimTimeout = setTimeout(claimPC, 1000);
    }

    return () => {
      if (claimTimeout) clearTimeout(claimTimeout);
    };
  }, [hasOrders, orderPrefix, sessionId, isAdmin]);

  // Warn user before closing if they have items in cart
  // Skip for admins since they don't claim PCs
  useEffect(() => {
    // Admins don't claim PCs, so no need for warnings
    if (isAdmin) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      try {
        // Warn user if they have items in cart (not yet ordered)
        if (hasOrders) {
          e.preventDefault();
          e.returnValue = 'You have items in your cart. Are you sure you want to close?';
          return e.returnValue;
        }
      } catch (err) {
        // Silently fail
      }
    };

    const handleVisibilityChange = () => {
      // Only release PC when page is hidden and has items in cart
      if (document.visibilityState === 'hidden' && orderPrefix && hasOrders) {
        // User had items in cart but is closing/leaving - release the temporary claim
        const blob = new Blob([JSON.stringify({
          session_id: sessionId,
          pc_number: orderPrefix,
        })], { type: 'application/json' });
        navigator.sendBeacon(`${api.defaults.baseURL}/pc-session/release`, blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, hasOrders, orderPrefix, isAdmin]);

  // On mount, check backend for any pending orders tied to this session and
  // set `active_pc` so the window won't be allowed to create orders for
  // different PCs (covers orders created before this frontend code ran).
  // Skip this entirely for admins - they can use any PC freely
  useEffect(() => {
    // Admins don't need PC locking/restoration - they can freely switch
    if (isAdmin) return;
    
    let mounted = true;
    const checkSessionOrders = async () => {
      try {
        const res = await api.get(`/orders/by-session/${sessionId}`);
        const list = Array.isArray(res.data) ? res.data : res.data.data || [];
        console.log('[SelectedSidebar] Orders for my session:', { sessionId, orders: list });
        if (!mounted) return;
        if (list.length > 0) {
          // Use the most recent pending order's PC alias if available
          const recent = list[0];
          const alias = recent.order_alias || null;
          if (alias) {
            const m = alias.match(/PC-(\d+)/);
            if (m) {
              const pcNum = m[1];
              const existingActivePc = sessionStorage.getItem('active_pc');
              console.log('[SelectedSidebar] Found PC from orders:', { pcNum, existingActivePc });
              try { 
                sessionStorage.setItem('active_pc', pcNum);
                // Only auto-set PC dropdown if not already set (initial load only)
                if (!existingActivePc) {
                  console.log('[SelectedSidebar] Auto-setting PC to:', pcNum);
                  setOrderPrefix(pcNum);
                } else {
                  console.log('[SelectedSidebar] Keeping existing PC selection');
                }
              } catch (e) {}
              // Note: Don't add own PC to lockedPCs here - it's already locked by broadcast events
            }
          }
        }
      } catch (e) {
        // ignore errors
      }
    };
    checkSessionOrders();
    return () => { mounted = false; };
  }, [sessionId, isAdmin]);

    // Helper to show SweetAlert2 modals while disabling top overlays and
    // focusing the confirm button so users can click immediately.
    const showAlert = async (options: any) => {
      const disableTopOverlays = () => {
        const modified: HTMLElement[] = [];
        try {
          const openDialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
          if (openDialog) {
            const btns = Array.from(openDialog.querySelectorAll('button')) as HTMLButtonElement[];
            const cancelBtn = btns.find((b) => b.textContent?.trim() === 'Cancel');
            if (cancelBtn) cancelBtn.click();
            else {
              const closeBtn = openDialog.querySelector('[data-state] button, [aria-label="Close"]') as HTMLElement | null;
              if (closeBtn) closeBtn.click();
            }
          }

          const candidates = Array.from(document.querySelectorAll('div.fixed.inset-0, [role="dialog"]')) as HTMLElement[];
          for (const el of candidates) {
            if (el.classList && el.classList.contains('swal2-container')) continue;
            try { el.style.pointerEvents = 'none'; modified.push(el); } catch (er) { /* ignore */ }
          }
          try { (document.activeElement as HTMLElement | null)?.blur(); } catch (er) { /* ignore */ }
        } catch (e) { /* ignore */ }
        return modified;
      };

      const restoreOverlays = (list: HTMLElement[]) => {
        try { for (const el of list) { try { el.style.pointerEvents = ''; } catch (er) { } } } catch (e) { /* ignore */ }
      };

      const modified = disableTopOverlays();

      const originalWillOpen = options.willOpen;
      const wrappedWillOpen = () => {
        try { if (originalWillOpen) originalWillOpen(); } catch (e) { /* ignore */ }
        const container = document.querySelector('.swal2-container') as HTMLElement | null;
        if (container) container.style.zIndex = '300000';
        setTimeout(() => { try { (document.querySelector('.swal2-confirm') as HTMLElement | null)?.focus(); } catch (e) {} }, 50);
      };

      try {
        await Swal.fire({ ...options, willOpen: wrappedWillOpen });
      } finally {
        try { restoreOverlays(modified); } catch (e) { /* ignore */ }
      }
    };
  
  // Check if egg products have cooking preferences
  const hasMissingPreferences = orders.some(order => {
    const hasEgg = order.productName?.toLowerCase().includes('egg') || 
      (order.is_bundle && bundleComponents[order.id] && products.length > 0 && bundleComponents[order.id]?.some(comp => {
        const compProduct = products.find((p: any) => p.id === comp.id);
        return compProduct?.product_name?.toLowerCase().includes('egg');
      }));
    
    if (!hasEgg) return false;
    
    // For quantity >= 2, check if cookingPreferences are fully assigned
    if (order.quantity >= 2) {
      const total = (order.cookingPreferences?.['Sunny Side Up'] ?? 0) + 
                    (order.cookingPreferences?.['Boiled'] ?? 0) + 
                    (order.cookingPreferences?.['Scrambled'] ?? 0);
      return total !== order.quantity;
    }
    
    // For quantity = 1, check if notes is set
    return !order.notes;
  });
  // Allow order if: admin, PC not locked, OR PC is this session's own active PC
  const activePcNumber = (() => {
    try {
      return sessionStorage.getItem('active_pc');
    } catch {
      return null;
    }
  })();
  const isOwnPC = activePcNumber && String(activePcNumber) === String(orderPrefix);
  
  // With auto PC assignment, no locking needed - each tab has unique PC
  const canPlaceOrder = hasOrders && !hasMissingPreferences;

  // Debug log when canPlaceOrder changes
  useEffect(() => {
    console.log('[SelectedSidebar] canPlaceOrder state changed:', {
      canPlaceOrder,
      hasOrders,
      hasMissingPreferences,
      orderPrefix
    });
  }, [canPlaceOrder, hasOrders, hasMissingPreferences, orderPrefix]);

  // Check if we can increase quantity for an order
  const canIncreaseQuantity = (order: OrderItem): boolean => {
    // Non-stockable items (not bundles) can always increase
    if (!order.is_stockable && !order.is_bundle) {
      return true;
    }
    
    // For bundles, check against their calculated stock
    if (order.is_bundle) {
      const bundleStock = order.stock ?? productStocks[order.id] ?? 0;
      return order.quantity < bundleStock;
    }
    
    // For regular stockable products, check stock
    const baseStock = order.stock ?? productStocks[order.id] ?? 0;
    return order.quantity < baseStock;
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get('/categories');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        const list = data.map((c: any) => ({ id: String(c.id), label: c.category_name ?? c.name ?? `#${c.id}` }));
        setAvailableCategories(list);
      } catch (e) {
        setAvailableCategories([]);
      }
    };
    
    const loadProducts = async () => {
      try {
        const [prodRes, invRes] = await Promise.all([
          api.get('/products'),
          api.get('/inventories')
        ]);
        if (!mounted) return;
        
        const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
        
        // Store products
        setProducts(prodData);
        
        // Build stock map
        const stockMap: Record<number, number> = {};
        for (const inv of invData) {
          const pid = inv.product_id ?? inv.product?.id;
          const qty = Number(inv.quantity ?? 0) || 0;
          if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
        }
        setProductStocks(stockMap);
        
        // Store bundle components
        const bundles: Record<number, Array<{id: number, quantity: number}>> = {};
        for (const p of prodData) {
          if (p.is_bundle && p.bundle_items && Array.isArray(p.bundle_items)) {
            const components: Array<{id: number, quantity: number}> = [];
            for (const item of p.bundle_items) {
              const bundledProductId = item.bundled_product?.id ?? item.bundled_product_id;
              if (bundledProductId) {
                components.push({
                  id: bundledProductId,
                  quantity: item.quantity ?? 1
                });
              }
            }
            bundles[p.id] = components;
          }
        }
        setBundleComponents(bundles);
      } catch (e) {
        // Ignore errors
      }
    };
    
    load();
    loadProducts();
    return () => { mounted = false; };
  }, []);

  const confirmOrder = async () => {
    if (!hasOrders) return;
    
    // With auto PC assignment, no validation needed - each tab has unique PC
    console.log('✅ Submitting order for auto-assigned PC-' + orderPrefix);
    
    setSubmitting(true);
    try {
      // Get Philippine Time (UTC+8)
      const phTime = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
      const payload = {
        order_date: phTime.toISOString().split('T')[0],
        order_items: orders.map((o) => ({ 
          product_id: o.id, 
          quantity: o.quantity, 
          price: o.price, 
          category_id: (o as any).category_id ?? null, 
          notes: o.notes ?? null,
          cookingPreferences: o.cookingPreferences ?? null
        })),
        pc_number: orderPrefix, // Send the PC station number
        session_id: sessionId, // Tag order with session
      };
      console.log('🔍 Order payload with PC-' + orderPrefix + ':', JSON.stringify(payload, null, 2));
      console.log('📍 Current orderPrefix when submitting:', orderPrefix);
      console.log('🛒 Orders with notes:', orders.map(o => ({ id: o.id, name: o.productName, notes: o.notes })));

      // success: post the order and close the sidebar first so the SweetAlert
      // appears above page content. Also ensure the confirm Dialog (modal)
      // is programmatically closed so it doesn't block clicks to the alert.
      const res = await api.post('/orders', payload);
      // Mark this browser window as using this PC while the order is pending.
      // Skip for admins - they can freely switch between PCs
      if (!isAdmin) {
        try {
          sessionStorage.setItem('active_pc', String(orderPrefix));
        } catch (e) {
          // ignore storage errors
        }
      }
      toggleSidebar();

      // try to programmatically close any open Radix Dialog content (the
      // confirmation modal) so it doesn't intercept clicks. We look for the
      // dialog element and click its 'Cancel' (DialogClose) button if present.
      try {
        const openDialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        if (openDialog) {
          const btns = Array.from(openDialog.querySelectorAll('button')) as HTMLButtonElement[];
          const cancelBtn = btns.find((b) => b.textContent?.trim() === 'Cancel');
          if (cancelBtn) cancelBtn.click();
          else {
            // fallback: click any Radix close button inside the dialog
            const closeBtn = openDialog.querySelector('[data-state] button, [aria-label="Close"]') as HTMLElement | null;
            if (closeBtn) closeBtn.click();
          }
        }
      } catch (e) {
        // ignore any errors while trying to close the modal programmatically
      }

      // brief delay to allow DOM transitions to start and ensure overlay is removed
      await new Promise((r) => setTimeout(r, 180));

      // attempt to disable the sidebar overlay's pointer events so SweetAlert
      // receives clicks immediately. Look for the overlay element (fixed inset-0)
      // with the same z-index used by the sidebar overlay.
      let overlayEl: HTMLElement | null = null;
      try {
        const candidates = Array.from(document.querySelectorAll('div.fixed.inset-0')) as HTMLElement[];
        overlayEl = candidates.find((el) => getComputedStyle(el).zIndex === '100000') || null;
        if (overlayEl) {
          overlayEl.style.pointerEvents = 'none';
        }
      } catch (e) {
        overlayEl = null;
      }

      // show alert with raised z-index so it appears above any remaining UI
      // Try to include the created order alias in the success text
      const orderAlias = res?.data?.data?.order_alias || null;
      const createdOrderId = res?.data?.data?.id || res?.data?.data?.order_id || res?.data?.data?.orderNo || null;
      const successText = orderAlias
        ? `${res?.data?.message || 'Your order was placed successfully.'} Your order number is ${orderAlias}.`
        : createdOrderId
        ? `${res?.data?.message || 'Your order was placed successfully.'} Your order number is #${createdOrderId}.`
        : (res?.data?.message || 'Your order was placed successfully.');

      await showAlert({
        title: 'Order Placed',
        text: successText,
        icon: 'success',
        // remove confirm/close buttons and auto-close after a slightly longer delay
        showConfirmButton: false,
        showCloseButton: false,
        // increased duration so the order number can be clearly read by users
        timer: 4000,
        timerProgressBar: true,
        allowOutsideClick: true,
      });

      // restore overlay pointer events if we modified it (cleanup)
      try {
        if (overlayEl) overlayEl.style.pointerEvents = '';
      } catch (e) {
        // ignore
      }

      // only clear orders after user confirms the success message so the sidebar
      // content isn't immediately removed underneath the popup (avoids header shift)
      clearOrders();
      
      // Dispatch a custom event so Orders page (Billing Queue) and OrderPage can refresh their data
      try {
        const eventData = { orderId: createdOrderId, orderAlias, timestamp: Date.now() };
        
        console.log('[SelectedSidebar] 📤 Dispatching order:placed event:', eventData);
        
        // Dispatch to same window
        window.dispatchEvent(new CustomEvent('order:placed', { 
          detail: eventData
        }));
        
        // Set localStorage for cross-window communication
        localStorage.setItem('app:order-placed', JSON.stringify(eventData));
        
        // Trigger storage event manually for same window (storage event doesn't fire in same window)
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'app:order-placed',
          newValue: JSON.stringify(eventData),
          url: window.location.href,
          storageArea: localStorage
        }));
        
        console.log('[SelectedSidebar] ✅ Order placed event dispatched successfully');
      } catch (e) {
        console.error('[SelectedSidebar] ❌ Failed to dispatch order:placed event:', e);
      }
      
      // Refresh products and inventory without reloading the page
      try {
        console.debug('[SelectedSidebar] Dispatching IMMEDIATE products:refresh event...');
        window.dispatchEvent(new CustomEvent('products:refresh'));
        
        // No localStorage flag needed; rely on backend only
        
        // Add additional refreshes to ensure it processes
        setTimeout(() => {
          console.debug('[SelectedSidebar] Dispatching second products:refresh event after 200ms...');
          window.dispatchEvent(new CustomEvent('products:refresh'));
        }, 200);
        
        setTimeout(() => {
          console.debug('[SelectedSidebar] Dispatching third products:refresh event after 500ms...');
          window.dispatchEvent(new CustomEvent('products:refresh'));
        }, 500);
      } catch (e) {
        console.debug('Failed to dispatch products:refresh event:', e);
      }
    } catch (err: any) {
      const resp = err?.response;
      // If server returned a 409 with an active_pc, surface a clear message
      if (resp && resp.status === 409 && resp.data && resp.data.active_pc) {
        await showAlert({
          title: 'Active PC Detected',
          text: `This window already has a pending order for PC-${resp.data.active_pc}. Please complete or cancel it before using another PC.`,
          icon: 'warning',
          confirmButtonColor: '#ef4444',
        });
      } else {
        const msg = resp?.data?.error || resp?.data?.message || err?.message || 'Failed to place order';
        await showAlert({
          title: 'Error',
          text: String(msg),
          icon: 'error',
          showConfirmButton: false,
          showCloseButton: false,
          timer: 1800,
          timerProgressBar: true,
          allowOutsideClick: true,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Dark overlay behind the sidebar */}
      <div
        onClick={toggleSidebar}
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 z-[100000] ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      ></div>

      {/* Sidebar itself */}
      <aside
        className={`fixed top-0 right-0 h-screen w-[400px] bg-white dark:bg-gray-900 shadow-2xl z-[100001] flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header inside sidebar */}
        <div className="flex flex-col gap-2 px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Order Summary</h2>
            </div>
            <button
              onClick={toggleSidebar}
              aria-label="Close order sidebar"
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover:rotate-90"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          {/* Guest notice when not logged in */}
          {/* If you need to check authentication, use backend/session, not localStorage */}
            <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
              You're ordering as a guest. Orders will be processed by staff.
            </div>
        </div>

        {/* Orders list with fixed height for 4 items */}
        <div className="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="relative bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md dark:shadow-gray-900/50 transition-all duration-200 border border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => removeFromOrder(order.id)}
                    aria-label={`Remove ${order.productName}`}
                    className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200 group z-10"
                  >
                    <X className="w-4 h-4 text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
                  </button>
                  <div className="flex gap-4 items-start pr-8">
                    {/* Product Image / Placeholder */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-800 flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {order.image ? (
                        <img src={order.image} alt={order.productName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800">{String(order.productName || '—').charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    
                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      {/* Category pill */}
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 mb-1">
                          {/** try to map to known category label if possible */}
                          {(() => {
                            try {
                              const catLabel = String(order.category ?? '').toLowerCase();
                              const catId = String((order as any).category_id ?? '').trim();
                              const found = (availableCategories || []).find((c: any) => {
                                if (catId && String(c.id) === catId) return true;
                                const label = String(c.label ?? '').toLowerCase();
                                return label === catLabel || catLabel.includes(label) || label.includes(catLabel) || String(c.id).toLowerCase() === catLabel;
                              });
                              return found ? found.label : (order.category || 'Uncategorized');
                            } catch (e) {
                              return order.category || 'Uncategorized';
                            }
                          })()}
                      </span>
                      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 truncate">
                        {order.productName}
                      </h4>
                      {/* keep optional product meta here; removed duplicate category text */}
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        SKU #{order.id}
                      </p>
                      {/* Cooking Preference for Egg Products */}
                      {(order.productName?.toLowerCase().includes('egg') || 
                        (order.is_bundle && bundleComponents[order.id] && products.length > 0 && bundleComponents[order.id]?.some(comp => {
                          const compProduct = products.find(p => p.id === comp.id);
                          return compProduct?.product_name?.toLowerCase().includes('egg');
                        }))) && (
                        <div className="mt-2 space-y-2">
                          {/* Show input only when quantity is 2 or more */}
                          {order.quantity >= 2 ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                                How many of each style? (Total: {order.quantity})
                              </label>
                              <div className="space-y-1.5">
                                {(() => {
                                  const total = (order.cookingPreferences?.['Sunny Side Up'] ?? 0) + 
                                                (order.cookingPreferences?.['Boiled'] ?? 0) + 
                                                (order.cookingPreferences?.['Scrambled'] ?? 0);
                                  return ['Sunny Side Up', 'Boiled', 'Scrambled'].map(style => {
                                    const currentValue = order.cookingPreferences?.[style as keyof typeof order.cookingPreferences] ?? 0;
                                    const remaining = order.quantity - total + currentValue;
                                    const isDisabled = total >= order.quantity && currentValue === 0;
                                    return (
                                      <div key={style} className="flex items-center gap-2">
                                        <label className="text-xs text-gray-600 dark:text-gray-400 w-24">
                                          {style}:
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          max={remaining}
                                          value={currentValue}
                                          onChange={(e) => {
                                            const newValue = Math.max(0, Math.min(remaining, parseInt(e.target.value) || 0));
                                            updateCookingPreferences(order.id, {
                                              ...order.cookingPreferences,
                                              [style]: newValue
                                            });
                                          }}
                                          disabled={isDisabled}
                                          className={`flex-1 px-2 py-1 text-xs border rounded-md focus:outline-none ${
                                            isDisabled
                                              ? 'border-gray-300 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500 cursor-not-allowed'
                                              : 'border-gray-300 focus:ring-1 focus:ring-[#F97316] dark:bg-gray-700 dark:border-gray-600 dark:text-white'
                                          }`}
                                        />
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                              {(() => {
                                const total = (order.cookingPreferences?.['Sunny Side Up'] ?? 0) + 
                                              (order.cookingPreferences?.['Boiled'] ?? 0) + 
                                              (order.cookingPreferences?.['Scrambled'] ?? 0);
                                return (
                                  <div className={`text-xs font-medium ${total === order.quantity ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {total} / {order.quantity} assigned
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Egg Cooking Preference
                              </label>
                              <select
                                value={order.notes || ''}
                                onChange={(e) => updateNotes(order.id, e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F97316] dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                              >
                                <option value="">Select cooking style...</option>
                                <option value="Sunny Side Up">Sunny Side Up</option>
                                <option value="Scrambled">Scrambled</option>
                                <option value="Boiled">Boiled</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white/95">
                              ₱{order.price.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(order.id, -1)}
                              className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Minus className="w-4 h-4 text-gray-500" />
                            </button>
                            <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[20px] text-center">
                              {order.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(order.id, 1)}
                              className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canIncreaseQuantity(order)}
                            >
                              <Plus className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        </div>
                          <span className="text-sm font-semibold text-brand-600 dark:text-brand-500">
                            ₱{(order.price * order.quantity).toFixed(2)}
                        </span>
                      </div>
                      {/* Display Selected Cooking Preferences Summary */}
                      {(order.productName?.toLowerCase().includes('egg') || 
                        (order.is_bundle && bundleComponents[order.id] && products.length > 0 && bundleComponents[order.id]?.some(comp => {
                          const compProduct = products.find(p => p.id === comp.id);
                          return compProduct?.product_name?.toLowerCase().includes('egg');
                        }))) && (
                        <>
                          {(() => {
                            // Handle both camelCase (from state) and snake_case (from API)
                            const prefs = order.cookingPreferences || order.cooking_preferences;
                            const hasPrefs = prefs && typeof prefs === 'object' && Object.values(prefs).some((v: any) => typeof v === 'number' && v > 0);
                            return hasPrefs ? (
                              <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded border-l-2 border-amber-500">
                                <span className="font-semibold text-amber-700 dark:text-amber-400">🍳 Breakdown:</span>
                                <div className="mt-0.5 space-y-0.5">
                                  {(prefs?.['Sunny Side Up'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Sunny Side Up: {prefs['Sunny Side Up']}</div>}
                                  {(prefs?.['Boiled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Boiled: {prefs['Boiled']}</div>}
                                  {(prefs?.['Scrambled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Scrambled: {prefs['Scrambled']}</div>}
                                </div>
                              </div>
                            ) : order.notes ? (
                              <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border-l-2 border-amber-500">
                                <span className="font-semibold text-amber-700 dark:text-amber-400">🍳 Cooking:</span>
                                <span className="text-amber-700 dark:text-amber-300"> {order.notes}</span>
                              </div>
                            ) : null;
                          })()}
                        </>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Fixed Total Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-base font-medium text-gray-800 dark:text-white/90">Total</span>
              <span className="text-lg font-semibold text-brand-600 dark:text-brand-500">
                            ₱{orders.reduce((total: number, order: OrderItem) => total + (order.price * order.quantity), 0).toFixed(2)}
              </span>
            </div>
            
            {/* Warning message for missing preferences */}
            {hasMissingPreferences && (
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Please select cooking preference for all bundle meals before placing order
                </p>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                disabled={!hasOrders}
                onClick={async () => {
                  // Release temporary PC claim when clearing cart (skip for admins)
                  if (!isAdmin && orderPrefix && hasOrders) {
                    try {
                      await api.post('/pc-session/release', {
                        pc_number: orderPrefix,
                        session_id: sessionId,
                      });
                      console.log(`🔓 Released PC-${orderPrefix} (cart cleared)`);
                    } catch (err) {
                      // Silently fail
                    }
                  }
                  clearOrders();
                  toggleSidebar();
                }}
                className={`flex-1 py-3 px-4 font-medium rounded-lg border transition-colors ${
                  hasOrders
                    ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    : "border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-600 cursor-not-allowed opacity-50"
                }`}
              >
                Clear All
              </button>
              
              {/* Place Order Button and Modal */}
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    disabled={!canPlaceOrder}
                    aria-disabled={!canPlaceOrder}
                    className={`flex-1 py-3 px-4 font-medium rounded-lg transition-colors text-white ${
                      canPlaceOrder
                        ? "bg-brand-600 hover:bg-brand-700"
                        : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-50"
                    }`}
                  >
                    Place Order
                  </button>
                </DialogTrigger>
              <DialogContent className="max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Confirm Order</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to place this order? Please review your items before confirming.
                  </DialogDescription>
                </DialogHeader>
                
                {/* Auto-Assigned PC Display */}
                <div className="mt-4 p-4 bg-gradient-to-r from-brand-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-brand-200 dark:border-gray-600">
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-3">
                    🖥️ Auto-Assigned PC Station
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-white dark:bg-gray-900 rounded-lg border-2 border-brand-400 dark:border-brand-500">
                      <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">PC-{orderPrefix.padStart(2, '0')}</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <p>✅ This tab is automatically assigned to PC-{orderPrefix.padStart(2, '0')}</p>
                      <p className="mt-1">💡 Open new tabs to get different PC numbers</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    📌 Each browser tab gets its own unique PC number automatically
                  </p>
                </div>
                
                <div className="flex-1 overflow-y-auto mt-4 space-y-4">
                  <div className="space-y-3 pr-4">
                    {orders.map((order: OrderItem) => (
                      <div key={order.id} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{order.productName} × {order.quantity}</span>
                          <span className="text-gray-900 dark:text-white">₱{(order.price * order.quantity).toFixed(2)}</span>
                        </div>
                        {order.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic pl-2">
                            Note: {order.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">Total Amount</span>
                            <span className="font-semibold text-brand-600 dark:text-brand-500">
                              ₱{orders.reduce((total: number, order: OrderItem) => total + (order.price * order.quantity), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-4">
                  <DialogClose className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    Cancel
                  </DialogClose>
                  <button
                    disabled={!canPlaceOrder || submitting}
                    aria-disabled={!canPlaceOrder || submitting}
                    onClick={confirmOrder}
                    className={`px-4 py-2 font-medium rounded-lg transition-colors text-white ${
                      canPlaceOrder && !submitting
                        ? "bg-brand-600 hover:bg-brand-700"
                        : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-50"
                    } ${submitting ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    {submitting ? 'Placing...' : 'Confirm Order'}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </aside>

      {/* Floating Cart Button - Fixed at bottom right, appears when scrolling down */}
      {hasOrders && !isOpen && showFloatingButton && (
        <div className="fixed bottom-6 right-6 z-[99999]">
          <button
            onClick={toggleSidebar}
            className="bg-[#F97316] hover:bg-[#d65f12] text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center animate-in fade-in slide-in-from-bottom-4 relative"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 bg-white text-[#F97316] rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-[#F97316] animate-ping opacity-75">
              {orders.length}
            </span>
            <span className="absolute -top-1 -right-1 bg-white text-[#F97316] rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-[#F97316]">
              {orders.length}
            </span>
          </button>
        </div>
      )}
    </>
  );
};

export default SelectedSidebar;
