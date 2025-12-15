import { useState, useEffect, useCallback } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import api from "../../lib/axios";
import PageMeta from "../../components/common/PageMeta";
import ProductGrid from "../../components/card/ProductGrid";
import Button from "../../components/ui/button/Button";
import ComponentCard from "../../components/common/ComponentCard";
import { useOrders } from "../../context/OrderContext";
import SelectedSidebar from "../../layout/SelectedSidebar";
import Category from "../../components/common/Category";
import CustomerAppHeader from "../../layout/CustomerAppHeader";
import { ShoppingCart, Plus, Minus, X } from "lucide-react";
import Swal from "sweetalert2";

export default function OrderPage() {
  const [isOpen, setIsOpen] = useState(false);
  const { orders, addToOrder } = useOrders();
  
  // Generate a browser instance ID (shared between tabs in same window via localStorage)
  // This allows different tabs to see each other's pending orders
  const [browserInstanceId] = useState(() => {
    let id = localStorage.getItem('browser_instance_id');
    if (!id) {
      id = `browser_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('browser_instance_id', id);
    }
    console.log('[user_order] 🌐 Browser instance ID:', id);
    return id;
  });
  
  // Generate unique window ID for cross-window tracking
  const [windowId] = useState(() => {
    const id = `window_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('window_id', id);
    return id;
  });
  
  const [pcNumber, setPcNumber] = useState<string>(() => {
    // Read PC number from sessionStorage first (set by SelectedSidebar when user selects PC)
    // If not available, try localStorage (shared across tabs in same window)
    const sessionPc = sessionStorage.getItem('active_pc');
    const localPc = localStorage.getItem('browser_last_selected_pc');
    const activePc = sessionPc || localPc || '';
    console.log('[user_order] 🖥️ Initial PC - sessionStorage:', sessionPc, 'localStorage:', localPc, 'final:', activePc);
    return activePc;
  });
  
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [categories, setCategories] = useState<{id:string; label:string}[]>([{ id: 'all', label: 'All' }]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [bestSellers, setBestSellers] = useState<any[]>([]);
  const [meals, setMeals] = useState<any[]>([]);
  const [mealsBundleComponents, setMealsBundleComponents] = useState<Record<number, Array<{id: number, quantity: number}>>>({});
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [bestSellerQuantities, setBestSellerQuantities] = useState<Record<number, number>>({});
  const [mealsQuantities, setMealsQuantities] = useState<Record<number, number>>({});
  const [bestSellersPage, setBestSellersPage] = useState(0);
  const [mealsPage, setMealsPage] = useState(0);
  const [bestSellersLoading, setBestSellersLoading] = useState(true);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [archivedProducts, setArchivedProducts] = useState<Set<string>>(new Set());
  const itemsPerPage = 5;
  
  // Helper function to check if a product contains any archived ingredient
  const containsArchivedIngredient = (product: any): boolean => {
    if (!product) return false;
    
    const productName = (product.product_name || product.name || '').toLowerCase().trim();
    
    // Check if the product itself is an archived ingredient
    if (archivedProducts.has(productName)) {
      console.log('[user_order] ✗ Product itself is archived:', productName);
      return true;
    }
    
    // Check if bundle contains any archived ingredients
    if (!product.is_bundle || !product.bundle_items || !Array.isArray(product.bundle_items)) {
      return false;
    }
    
    // Check both the bundled product status and the ingredient name in archived set
    const hasArchived = product.bundle_items.some((item: any) => {
      // Check status directly from bundle_items (added in API response)
      if (item.status === 'archived') {
        console.log('[user_order] ✗ Bundle ingredient is archived:', item.product_name, 'in product:', productName);
        return true;
      }
      
      // Also check by name in archived set
      const bundledProduct = item.bundled_product || item.product;
      if (!bundledProduct && item.product_name) {
        // Use product_name from bundle_items if bundled_product not present
        const name = (item.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[user_order] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      if (bundledProduct) {
        const name = (bundledProduct.name || bundledProduct.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[user_order] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      return false;
    });
    
    return hasArchived;
  };
  
  // Calculate available stock considering cart reservations for meals
  const getMealAvailableStock = (productId: number, baseStock: number): number => {
    let reserved = 0;
    
    // Count direct reservations (product itself in cart)
    const directOrder = orders.find(o => o.id === productId);
    if (directOrder) {
      reserved += directOrder.quantity;
    }
    
    // Count reservations from bundles in cart
    for (const order of orders) {
      if (order.is_bundle) {
        const components = mealsBundleComponents[order.id];
        if (components) {
          const component = components.find(c => c.id === productId);
          if (component) {
            reserved += component.quantity * order.quantity;
          }
        }
      }
    }
    
    return Math.max(0, baseStock - reserved);
  };
  
  // Pending orders state (orders that have been placed but not yet confirmed/paid)
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  
  // Track the session ID from SelectedSidebar
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const stored = sessionStorage.getItem('guest_session_id');
    console.log('[user_order] 📍 Initial sessionId from sessionStorage:', stored);
    return stored || '';
  });
  
  // Watch for session ID changes and update state
  useEffect(() => {
    const checkSessionId = () => {
      const stored = sessionStorage.getItem('guest_session_id');
      if (stored && stored !== currentSessionId) {
        console.log('[user_order] 📍 Session ID changed - updating:', stored);
        setCurrentSessionId(stored);
      }
    };
    
    // Check immediately and on faster interval (100ms for faster updates)
    checkSessionId();
    const interval = setInterval(checkSessionId, 100);
    
    return () => clearInterval(interval);
  }, [currentSessionId]);
  
  // Load pending orders immediately on mount for faster display
  useEffect(() => {
    console.log('[user_order] 🚀 Component mounted - loading pending orders immediately');
    loadPendingOrders();
  }, []);
  
  // Load pending orders function
  const loadPendingOrders = useCallback(async () => {
    try {
      // Get current PC - try sessionStorage first (this tab's selection), then localStorage (shared across tabs)
      const sessionPc = sessionStorage.getItem('active_pc');
      const localPc = localStorage.getItem('browser_last_selected_pc');
      const currentPc = sessionPc || localPc || pcNumber;
      const currentWindowId = sessionStorage.getItem('window_id') || windowId;
      
      // Get the session ID - always check sessionStorage for the most current value
      // This ensures we get the actual session_id being used by SelectedSidebar in this window
      const storedSessionId = sessionStorage.getItem('guest_session_id') || '';
      const sessionId = storedSessionId || currentSessionId || '';
      
      console.log('[user_order] 🔍 loadPendingOrders called - PC sources:', {
        sessionStorage: sessionPc,
        localStorage: localPc,
        state: pcNumber,
        final: currentPc,
        windowId: currentWindowId,
        storedSessionId: storedSessionId,
        stateSessionId: currentSessionId,
        finalSessionId: sessionId
      });
      // Don't load orders if no PC is selected
      if (!currentPc) {
        console.log('[user_order] ⏸️ No PC selected yet - skipping order load');
        setPendingOrders([]);
        return;
      }
      
      console.log('[user_order] 🔍 Loading pending orders for PC:', currentPc, 'windowId:', currentWindowId, 'sessionId:', sessionId);
      
      // Fetch orders by PC number
      const res = await api.get(`/orders/by-pc/${currentPc}`);
      const orderList = Array.isArray(res.data) ? res.data : res.data.data || [];
      
      console.log('[user_order] 📦 Fetched orders from API for PC-' + currentPc + ':', orderList.length, 'orders', orderList);
      
      // Filter for pending orders (not completed and not cancelled)
      // Show pending orders only from THIS window's session
      const pending = orderList.filter((order: any) => {
        console.log('[user_order] 🔍 Checking order:', {
          id: order.id,
          alias: order.order_alias,
          status: order.status,
          has_sale: !!order.sale,
          order_session_id: order.session_id,
          my_session_id: sessionId
        });
        
        // Skip completed orders (have sale records)
        if (order.sale) {
          console.log('[user_order] ⏭️ Skipping completed order (has sale):', order.id, order.order_alias);
          return false;
        }
        
        // Skip cancelled orders
        if (order.status === 'cancelled') {
          console.log('[user_order] ⏭️ Skipping cancelled order:', order.id, order.order_alias);
          return false;
        }
        
        // If we have a session ID, verify it matches
        if (sessionId) {
          const isMyOrder = order.session_id === sessionId;
          if (!isMyOrder) {
            console.log('[user_order] ⏭️ Skipping order from different session:', order.id, 'order session:', order.session_id, 'my session:', sessionId);
            return false;
          }
        } else {
          // No session ID available yet - include order but mark as temporary
          console.log('[user_order] ⚠️ No session ID yet, including order temporarily:', order.id);
        }
        
        console.log('[user_order] ✅ Including order:', order.id, order.order_alias, 'status:', order.status);
        return true;
      });
      
      console.log('[user_order] ✅ Loaded pending orders:', pending.length, 'orders for PC:', currentPc, 'session:', sessionId);
      console.log('[user_order] 🎯 Setting pendingOrders state:', pending);
      setPendingOrders(pending);
    } catch (err) {
      console.error('[user_order] ❌ Failed to load pending orders:', err);
      setPendingOrders([]);
    }
  }, [pcNumber, browserInstanceId, currentSessionId]);
  
  // Monitor sessionStorage AND localStorage changes for active_pc
  // This ensures new tabs sync with the last selected PC from any other tab
  useEffect(() => {
    const checkActivePc = () => {
      // Check sessionStorage first (this tab's current selection)
      const sessionPc = sessionStorage.getItem('active_pc');
      const localPc = localStorage.getItem('browser_last_selected_pc');
      
      console.log('[user_order] 📋 checkActivePc - sessionStorage:', sessionPc, 'localStorage:', localPc, 'state:', pcNumber);
      
      if (sessionPc && sessionPc !== pcNumber) {
        console.log('[user_order] ✅ PC number updated from sessionStorage:', sessionPc);
        setPcNumber(sessionPc);
        return;
      }
      
      // If no sessionStorage PC, check localStorage (shared across tabs)
      if (localPc && localPc !== pcNumber && !sessionPc) {
        console.log('[user_order] ✅ PC number updated from localStorage (shared across tabs):', localPc);
        setPcNumber(localPc);
      }
    };
    
    // Check immediately on mount
    checkActivePc();
    
    // Check periodically to stay in sync with other tabs
    const interval = setInterval(checkActivePc, 500);
    
    return () => clearInterval(interval);
  }, [pcNumber]);
  
  // Don't reload pending orders on PC changes - this causes flashing
  // Only reload on mount and let periodic updates handle refreshes
  // Pending orders stay visible for the current selection until completed
  
  // Periodic refresh of pending orders - only check for completions, don't reload based on PC
  useEffect(() => {
    const checkOrderCompletions = async () => {
      try {
        setPendingOrders(prev => {
          if (prev.length === 0) return prev;
          
          // Check each pending order to see if it's been completed
          return prev.filter(_pendingOrder => {
            // Keep order visible unless we know it's been completed
            // Completions are handled by WebSocket events and order confirmation listeners
            return true;
          });
        });
      } catch (err) {
        console.error('[user_order] Error in completion check:', err);
      }
    };
    
    const interval = setInterval(checkOrderCompletions, 3000);
    return () => clearInterval(interval);
  }, []);
  
  // Listen for order placements in this window and reload immediately
  useEffect(() => {
    const handleOrderPlaced = (_e: CustomEvent | any) => {
      console.log('[user_order] 🎯 Order placed event detected - reloading pending orders immediately');
      loadPendingOrders();
    };
    
    // Listen for order confirmation broadcasts
    window.addEventListener('order:placed' as any, handleOrderPlaced);
    document.addEventListener('order:placed' as any, handleOrderPlaced);
    
    return () => {
      window.removeEventListener('order:placed' as any, handleOrderPlaced);
      document.removeEventListener('order:placed' as any, handleOrderPlaced);
    };
  }, [loadPendingOrders]);
  
  // Cross-window tracking: Register this window and send heartbeat
  useEffect(() => {
    const updateWindowRegistry = () => {
      try {
        const currentPc = sessionStorage.getItem('active_pc') || pcNumber;
        const activeWindowsStr = localStorage.getItem('active_windows');
        const activeWindows = activeWindowsStr ? JSON.parse(activeWindowsStr) : {};
        
        // Register this window with its current PC number and timestamp
        activeWindows[windowId] = {
          pc: currentPc,
          lastSeen: Date.now()
        };
        
        localStorage.setItem('active_windows', JSON.stringify(activeWindows));
        console.log('[user_order] 💓 Heartbeat - Window ID:', windowId, 'PC:', currentPc);
      } catch (err) {
        console.error('[user_order] ❌ Error updating window registry:', err);
      }
    };
    
    // Listen for PC selection changes across tabs/windows
    const handlePcSelectionChange = (e: StorageEvent) => {
      if (e.key === 'pc_selection_broadcast') {
        try {
          const data = JSON.parse(e.newValue || '{}');
          const newPc = data.pcNumber;
          if (newPc && newPc !== pcNumber) {
            console.log('[user_order] 📢 PC selection changed in another tab:', newPc);
            setPcNumber(newPc);
            loadPendingOrders();
          }
        } catch (err) {}
      }
    };
    
    window.addEventListener('storage', handlePcSelectionChange);
    
    // Initial registration
    updateWindowRegistry();
    
    // Send heartbeat every 2 seconds to keep this window alive
    const heartbeatInterval = setInterval(updateWindowRegistry, 2000);
    
    // Cleanup: Remove this window from registry when component unmounts
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('storage', handlePcSelectionChange);
      try {
        const activeWindowsStr = localStorage.getItem('active_windows');
        const activeWindows = activeWindowsStr ? JSON.parse(activeWindowsStr) : {};
        delete activeWindows[windowId];
        localStorage.setItem('active_windows', JSON.stringify(activeWindows));
        console.log('[user_order] 🧹 Window closed - removed from registry, PC:', pcNumber);
      } catch (err) {
        console.error('[user_order] ❌ Error cleaning up window registry:', err);
      }
    };
  }, [windowId, pcNumber, loadPendingOrders]);
  
  // Load pending orders on mount and periodically
  useEffect(() => {
    console.log('[user_order] 🎬 Component mounted, loading initial pending orders');
    // Force read from sessionStorage in case state is stale
    const currentPc = sessionStorage.getItem('active_pc');
    if (currentPc && currentPc !== pcNumber) {
      console.log('[user_order] 🔄 Syncing PC number from sessionStorage:', currentPc);
      setPcNumber(currentPc);
    }
    loadPendingOrders();
    
    // Reload every 5 seconds to catch updates
    const interval = setInterval(() => {
      console.log('[user_order] ⏰ Periodic refresh of pending orders');
      loadPendingOrders();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [loadPendingOrders]);
  
  // Listen for order confirmation events from admin
  useEffect(() => {
    console.log('[user_order] Setting up order confirmation listener');
    
    const handleOrderConfirmed = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const confirmedOrderNumber = detail?.orderNumber || detail?.order_number;
      const confirmedPcNumber = detail?.pcNumber;
      const orderId = detail?.orderId;
      
      console.log('[user_order] 🎉 Order confirmed event received:', { confirmedOrderNumber, confirmedPcNumber, orderId, detail });
      
      if (confirmedOrderNumber) {
        console.log('[user_order] ✅ Showing alert for order:', confirmedOrderNumber);
        
        // Show success alert in all windows
        await Swal.fire({
          title: '✅ Order Confirmed!',
          html: `<div style="text-align: left;">
                   <p><strong>Order ${confirmedOrderNumber}</strong> (PC-${confirmedPcNumber})</p>
                   <p>Your order has been <strong>confirmed by the admin</strong>.</p>
                   <p>Please wait for the preparation.</p>
                 </div>`,
          icon: 'success',
          confirmButtonText: 'Great!',
          confirmButtonColor: '#ef4444',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            console.log('[user_order] Alert opened');
            // Auto-close after 5 seconds
            setTimeout(() => {
              Swal.close();
            }, 5000);
          }
        });
        
        // Reload pending orders to reflect the change
        console.log('[user_order] Reloading pending orders');
        loadPendingOrders();
      } else {
        console.log('[user_order] ⚠️ Received order:confirmed event but no orderNumber:', detail);
      }
    };
    
    // Listen for order:confirmed custom event
    console.log('[user_order] Adding event listener for order:confirmed');
    window.addEventListener('order:confirmed', handleOrderConfirmed);
    
    // Also listen for BroadcastChannel if available
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('order-receipts');
      console.log('[user_order] BroadcastChannel opened for order-receipts');
      channel.onmessage = (event) => {
        console.log('[user_order] 📻 BroadcastChannel message received:', event.data);
        if (event.data?.type === 'order:confirmed') {
          console.log('[user_order] 📻 Broadcasting order:confirmed via dispatchEvent');
          window.dispatchEvent(new CustomEvent('order:confirmed', { 
            detail: event.data.detail
          }));
        }
      };
    } catch (err) {
      console.debug('[user_order] BroadcastChannel not available:', err);
    }
    
    // Also listen for storage changes in case confirmation comes from another tab
    const handleStorageChange = (e: StorageEvent) => {
      console.log('[user_order] Storage event:', { key: e.key, newValue: e.newValue?.substring(0, 100) });
      
      if (e.key === 'order:confirmed' || e.key?.startsWith('order:confirmed:pc')) {
        try {
          const data = e.newValue ? JSON.parse(e.newValue) : {};
          const confirmedOrderNumber = data?.orderNumber || data?.order_number;
          
          console.log('[user_order] 💾 Storage event with order confirmation:', { key: e.key, orderNumber: confirmedOrderNumber });
          
          if (confirmedOrderNumber) {
            // Trigger the custom event in all windows
            console.log('[user_order] 💾 Dispatching order:confirmed from storage event');
            window.dispatchEvent(new CustomEvent('order:confirmed', { 
              detail: {
                orderNumber: confirmedOrderNumber,
                order_number: confirmedOrderNumber,
                pcNumber: data?.pcNumber || data?.pc_number,
                orderId: data?.orderId
              }
            }));
          }
        } catch (err) {
          console.debug('[user_order] Error parsing storage event:', err);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      console.log('[user_order] Cleaning up order confirmation listener');
      window.removeEventListener('order:confirmed', handleOrderConfirmed);
      window.removeEventListener('storage', handleStorageChange);
      if (channel) {
        channel.close();
      }
    };
  }, [loadPendingOrders]);
  
  // Check for archived key ingredients
  const checkArchivedIngredients = async () => {
    try {
      const res = await api.get('/products');
      const allProducts = Array.isArray(res.data) ? res.data : res.data.data || [];
      
      // Key ingredients to check: egg, rice, pancit canton, corned beef, beef loaf
      const keyIngredients = ['egg', 'rice', 'pancit canton', 'corned beef', 'beef loaf'];
      const archived = new Set<string>();
      
      keyIngredients.forEach(ingredientName => {
        const product = allProducts.find((p: any) => {
          const name = (p.product_name || p.name || '').toLowerCase().trim();
          return name === ingredientName && p.status === 'archived';
        });
        if (product) {
          console.log('[user_order] Found archived ingredient:', ingredientName, 'status:', product.status);
          archived.add(ingredientName);
        }
      });
      
      console.log('[user_order] Archived ingredients:', Array.from(archived));
      setArchivedProducts(archived);
    } catch (err) {
      console.error('[user_order] Failed to check archived ingredients:', err);
    }
  };
  
  // Check for archived key ingredients by fetching all products
  useEffect(() => {
    checkArchivedIngredients();
  }, []);
  
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setCategoriesLoading(true);
        const res = await api.get('/categories');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        type RawCategory = { id?: string | number; category_name?: string; name?: string };
        const mapped = data.map((c: RawCategory) => ({ id: String(c.id), label: c.category_name ?? c.name ?? `#${c.id}` }));
        // Sort categories to put Meals first (right after All)
        const sorted = mapped.sort((a: {id: string; label: string}, b: {id: string; label: string}) => {
          if (a.label.toLowerCase() === 'meals') return -1;
          if (b.label.toLowerCase() === 'meals') return 1;
          return 0;
        });
        setCategories([{ id: 'all', label: 'All' }, ...sorted]);
      } catch (err) {
        // fallback to single 'All' category
        console.debug('user_order categories load failed', err);
        setCategories([{ id: 'all', label: 'All' }]);
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    };
    
    const loadBestSellers = async () => {
      try {
        setBestSellersLoading(true);
        const prodRes = await api.get('/products/best-sellers');
        if (!mounted) return;
        
        const data = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        
        // Filter out archived standalone products
        const filteredData = data.filter((p: any) => {
          if (p.status === 'archived' && !p.is_bundle) return false;
          return true;
        });
        
        // Sort by total_sold in descending order (most sold first)
        const sortedData = filteredData.sort((a: any, b: any) => {
          const aSold = a.total_sold ?? 0;
          const bSold = b.total_sold ?? 0;
          return bSold - aSold;
        });
        
        // Set data immediately with backend stock info
        const withImages = sortedData.map((p: any) => ({
          ...p,
          image_url: p.image_url || (p.image ? `/storage/${p.image}` : null),
          // Use calculated_stock for bundles immediately
          stock: p.is_bundle ? (p.calculated_stock ?? 0) : (p.stock ?? 0),
        }));
        setBestSellers(withImages);
        setBestSellersLoading(false);
        
        // Load inventory in background to update stock if needed
        api.get('/inventories').then(invRes => {
          if (!mounted) return;
          const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
          const stockMap: Record<number, number> = {};
          for (const inv of invData) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          // Update with fresh inventory data
          const updated = withImages.map((p: any) => ({
            ...p,
            // Use calculated_stock for bundles, otherwise use inventory stock
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? p.stock ?? 0),
          }));
          setBestSellers(updated);
        }).catch(() => {});
        
      } catch (err) {
        console.debug('best sellers load failed', err);
        setBestSellers([]);
        setBestSellersLoading(false);
      }
    };
    
    const loadMeals = async () => {
      try {
        setMealsLoading(true);
        // Fetch products filtered by "Meals" category
        const prodRes = await api.get('/products');
        if (!mounted) return;
        
        const allProducts = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        
        // Filter for meals category
        const mealsData = allProducts.filter((p: any) => {
          const category = typeof p.category === 'string' ? p.category : 
                          p.category?.category_name || p.category?.name || p.category_name || '';
          
          // Hide individual Corned Beef and Beef Loaf (only sold as part of combo meals)
          const productName = String(p.product_name ?? p.name ?? '').toLowerCase();
          if (productName === 'corned beef' || productName === 'beef loaf') {
            return false;
          }
          
          // Hide archived standalone products
          if (p.status === 'archived' && !p.is_bundle) {
            return false;
          }
          
          return category.toLowerCase() === 'meals';
        });
        
        // Set data with images and extract bundle components
        const bundleComps: Record<number, Array<{id: number, quantity: number}>> = {};
        const withImages = mealsData.map((p: any) => {
          // Extract bundle components
          if (p.is_bundle && p.bundle_items && Array.isArray(p.bundle_items)) {
            bundleComps[p.id] = p.bundle_items.map((item: any) => ({
              id: item.bundled_product?.id ?? item.bundled_product_id,
              quantity: item.quantity ?? 1
            }));
          }
          
          return {
            ...p,
            image_url: p.image_url || (p.image ? `/storage/${p.image}` : null),
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (p.stock ?? 0),
          };
        });
        setMealsBundleComponents(bundleComps);
        setMeals(withImages);
        setMealsLoading(false);
        
        // Load inventory in background
        api.get('/inventories').then(invRes => {
          if (!mounted) return;
          const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
          const stockMap: Record<number, number> = {};
          for (const inv of invData) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          const updated = withImages.map((p: any) => ({
            ...p,
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? p.stock ?? 0),
          }));
          setMeals(updated);
        }).catch(() => {});
        
      } catch (err) {
        console.debug('meals load failed', err);
        setMeals([]);
        setMealsLoading(false);
      }
    };
    
    load();
    loadBestSellers();
    loadMeals();
    
    // Listen for order placement event and refresh products/inventory
    const handleOrderPlaced = () => {
      console.log('[user_order] 🚀 Order placed event received, refreshing stock and pending orders...');
      window.dispatchEvent(new CustomEvent('products:refresh'));
      // Reload bestsellers and meals to refresh stock counts
      loadBestSellers();
      loadMeals();
      // Wait a moment for the order to be saved, then load pending orders
      setTimeout(() => {
        console.log('[user_order] ⏰ Loading pending orders after order placement');
        loadPendingOrders();
      }, 1000);
    };
    
    // Listen for category filter changes
    const handleCategoryChange = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const category = String(detail.category ?? 'all').trim();
      setActiveCategory(category === '' ? 'all' : category);
    };
    
    // Listen for order completion from admin
    const handleOrderConfirmed = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const confirmedPcNumber = String(detail.pcNumber || detail.pc_number || '').trim();
      const currentPc = String(sessionStorage.getItem('active_pc') || '').trim();
      
      console.log('[user_order] 🎫 handleOrderConfirmed called:', {
        confirmedPC: confirmedPcNumber,
        currentPC: currentPc,
        match: confirmedPcNumber === currentPc,
        hasItems: !!detail.items,
        itemCount: detail.items?.length
      });
      
      // Only process if PC numbers match
      if (!confirmedPcNumber || !currentPc || confirmedPcNumber !== currentPc) {
        console.log('[user_order] ❌ Rejecting - PC mismatch or missing');
        return;
      }
      
      console.log('[user_order] ✅ PC MATCH! Refreshing orders...');
      
      // Reload pending orders
      loadPendingOrders();
    };
    
    // Cross-window communication via localStorage
    const handleStorageChange = (e: StorageEvent) => {
      // Handle order confirmation
      if (e.key?.startsWith('order:confirmed') && e.newValue) {
        console.log('[user_order] 📡 Storage event:', e.key);
        try {
          const data = JSON.parse(e.newValue);
          console.log('[user_order] 📡 Parsed data PC:', data.pcNumber);
          handleOrderConfirmed(new CustomEvent('order:confirmed', { detail: data }));
        } catch (err) {
          console.error('[user_order] Parse error:', err);
        }
      }
      
      // Handle order placement - refresh stock
      if (e.key === 'app:order-placed' && e.newValue) {
        handleOrderPlaced();
      }
      
      // Handle order cancellation
      if (e.key === 'order:cancelled') {
        handleOrderCancelled();
      }
    };
    
    const handleOrderCancelled = () => {
      console.log('[user_order] 🚫 Order cancelled event received - reloading pending orders');
      loadPendingOrders();
    };
    
    const handleProductsRefresh = () => {
      console.log('[user_order] 🔄 Products refresh event - reloading all products');
      loadBestSellers();
      loadMeals();
      // Re-check archived ingredients
      checkArchivedIngredients();
    };
    
    window.addEventListener('order:placed', handleOrderPlaced as EventListener);
    window.addEventListener('products:filterCategory', handleCategoryChange as EventListener);
    window.addEventListener('order:confirmed', handleOrderConfirmed as EventListener);
    window.addEventListener('order:cancelled', handleOrderCancelled as EventListener);
    window.addEventListener('products:refresh', handleProductsRefresh as EventListener);
    window.addEventListener('storage', handleStorageChange);
    
    console.log('[user_order] ✅ Listeners active (order events)');
    
    return () => {
      mounted = false;
      window.removeEventListener('order:placed', handleOrderPlaced as EventListener);
      window.removeEventListener('products:filterCategory', handleCategoryChange as EventListener);
      window.removeEventListener('order:confirmed', handleOrderConfirmed as EventListener);
      window.removeEventListener('order:cancelled', handleOrderCancelled as EventListener);
      window.removeEventListener('products:refresh', handleProductsRefresh as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pcNumber]);

  const toggleSidebar = () => setIsOpen(!isOpen);

  // NOTE: removed global 'orders:open' listener (order-now behavior reverted)

  const content = (
    <div className="relative bg-gray-100 min-h-screen">
      <CustomerAppHeader />
      <div className="relative px-4 pt-4 sm:px-6 lg:px-8">
        {/* Meta & Breadcrumb */}
        <PageMeta
          title="Order Management"
        />

        <div className="mb-6">
          <PageBreadcrumb
            pageTitle="Place Order"
            hideHome
            breadcrumbLabel=""
            />
          <div className="max-w-3xl text-sm text-gray-600 dark:text-gray-400 mb-2">Create and manage orders easily add items to your cart, review and checkout.</div>
          {categoriesLoading ? (
            <div className="mt-6 mb-6">
              <div className="mb-4">
                <h3 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white/95 leading-snug">Categories</h3>
              </div>
              <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3 max-w-4xl">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : (
            <Category initialCategories={categories} />
          )}
          <hr />

          {/* Professional Banner for Unpaid Orders - Shows above search bar */}
          {pendingOrders.length > 0 && (
            <div className="mt-6 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-xl shadow-lg overflow-hidden">
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Animated Icon */}
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-20"></div>
                      <div className="relative bg-white text-orange-600 rounded-full w-12 h-12 flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Message */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-bold text-base sm:text-lg">⚠️ Unpaid Order - Payment Required</h3>
                      </div>
                      <div className="flex items-center gap-3 text-white text-sm sm:text-base mt-1">
                        <span className="font-semibold bg-white/20 px-2.5 py-1 rounded-md">
                          {pendingOrders.length > 0 ? pendingOrders.reduce((s,o) => s + (o.order_items?.length || 0), 0) : 0} items
                        </span>
                        <span className="font-bold bg-white/20 px-2.5 py-1 rounded-md">
                          ₱{pendingOrders.length > 0 ? pendingOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0).toFixed(2) : '0.00'}
                        </span>
                      </div>
                      <p className="text-white/95 text-xs sm:text-sm mt-1.5">
                        Your order has been confirmed and is being prepared. Please wait 15 minutes, then proceed to the counter for payment.
                      </p>
                    </div>
                  </div>
                  
                  {/* View Details Button */}
                  <button
                    onClick={() => setShowOrderDetails(true)}
                    className="flex-shrink-0 bg-white text-orange-600 px-5 py-2.5 rounded-lg font-bold text-sm sm:text-base hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 whitespace-nowrap"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="mt-6">
            {categoriesLoading ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-100 dark:border-gray-800 rounded-xl p-3 shadow-sm">
                <div className="relative w-full sm:w-[340px] h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                <div className="flex items-center gap-3 ml-auto w-full sm:w-auto justify-between sm:justify-end">
                  <div className="hidden sm:flex sm:items-center sm:gap-3">
                    <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                  <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-100 dark:border-gray-800 rounded-xl p-3 shadow-sm">
                <div className="relative w-full sm:w-[340px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 19l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                  <input
                    onChange={(e) => {
                      const q = e.target.value ?? "";
                      window.dispatchEvent(new CustomEvent('products:search', { detail: { query: q } }));
                    }}
                    placeholder="Search products or categories..."
                    className="w-full pl-10 pr-3 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>

                <div className="flex items-center gap-3 ml-auto w-full sm:w-auto justify-between sm:justify-end">
                  <div className="hidden sm:flex sm:items-center sm:gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{orders.reduce((s,o) => s + o.quantity, 0)} items</span>
                      <span className="text-sm text-gray-400">•</span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-white">₱{orders.reduce((s, o) => s + (o.price * o.quantity), 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => toggleSidebar()} className="relative">
                      Review & Checkout
                      {orders.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {orders.length}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full space-y-6">
          {/* Best Sellers Section - Only show when All category is selected */}
          {activeCategory === 'all' && (
            <ComponentCard 
              title={<div className="flex items-center justify-between w-full">
                <span>🌟 Best Sellers</span>
                <span className="text-sm text-gray-400">Top selling products</span>
              </div>} 
              className="w-full"
            >
              <div className="space-y-4">
                {bestSellersLoading ? (
                  <div className="grid grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 animate-pulse">
                        <div className="h-40 bg-gray-200 dark:bg-gray-700"></div>
                        <div className="p-3 space-y-2">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                          <div className="flex items-center justify-center gap-2 mt-2">
                            <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                            <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                          </div>
                          <div className="flex justify-center mt-2">
                            <div className="w-28 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : bestSellers.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-4">
                      {bestSellers.slice(bestSellersPage * itemsPerPage, (bestSellersPage + 1) * itemsPerPage).map((product: any) => {
                    const imgUrl = product.image_url || (product.image ? `/storage/${product.image}` : null);
                    return (
                      <div 
                        key={product.id} 
                        className="relative bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700 group"
                      >
                        <div className="relative h-40 overflow-hidden bg-gray-100 dark:bg-gray-700">
                          {imgUrl && (
                            <img 
                              src={imgUrl} 
                              alt={product.product_name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/product/product-06.jpg';
                              }}
                            />
                          )}
                          <span className="absolute top-2 left-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded">Best Seller</span>
                        </div>
                        <div className="p-3">
                          <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{product.product_name || product.name}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{product.category?.category_name || product.category?.name || 'Uncategorized'}</p>
                          <p className="text-sm font-bold text-brand-600 dark:text-brand-500 mb-1">₱{Number(product.price).toFixed(2)}</p>
                          {product.status === 'archived' ? (
                            <p className="text-xs text-red-500 dark:text-red-400 mb-2 font-semibold">Archived</p>
                          ) : containsArchivedIngredient(product) ? (
                            <p className="text-xs text-red-500 dark:text-red-400 mb-2 font-semibold">Unavailable</p>
                          ) : product.is_bundle ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Stock: {product.stock ?? 0}</p>
                          ) : (product.is_stockable !== false && product.is_stockable !== 0) ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Stock: {product.stock ?? 0}</p>
                          ) : null}
                          
                          {/* Quantity Controls */}
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <button
                              onClick={() => {
                                const isOutOfStock = typeof product.stock === 'number' && product.stock <= 0;
                                const defaultQty = isOutOfStock ? 0 : 1;
                                const currentQty = bestSellerQuantities[product.id] ?? defaultQty;
                                if (currentQty > (isOutOfStock ? 0 : 1)) {
                                  setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty - 1 });
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={typeof product.stock === 'number' && product.stock <= 0 || (!bestSellerQuantities[product.id] || bestSellerQuantities[product.id] <= (typeof product.stock === 'number' && product.stock <= 0 ? 0 : 1))}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-10 text-center text-sm font-semibold text-gray-800 dark:text-white">
                              {typeof product.stock === 'number' && product.stock <= 0 
                                ? (bestSellerQuantities[product.id] ?? 0)
                                : (bestSellerQuantities[product.id] || 1)}
                            </span>
                            <button
                              onClick={() => {
                                const currentQty = bestSellerQuantities[product.id] ?? 1;
                                const maxQty = typeof product.stock === 'number' ? product.stock : 999;
                                
                                // For non-stockable items (not bundles), allow up to 999
                                if (!product.is_stockable && !product.is_bundle) {
                                  setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty + 1 });
                                } else if (currentQty < maxQty) {
                                  setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty + 1 });
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={
                                (!product.is_stockable && !product.is_bundle) 
                                  ? false 
                                  : (typeof product.stock === 'number' && ((bestSellerQuantities[product.id] ?? 1) >= product.stock))
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Cart Button */}
                          <div className="flex justify-center">
                            <button
                              onClick={() => {
                                try {
                                  const qty = bestSellerQuantities[product.id] || 1;
                                  const item = {
                                    id: product.id,
                                    productName: product.product_name || product.name,
                                    category: product.category?.category_name || product.category?.name || 'Uncategorized',
                                    category_id: product.category_id || null,
                                    price: Number(product.price) || 0,
                                    image: product.image_url || (product.image ? `/storage/${product.image}` : null),
                                    stock: typeof product.stock === 'number' ? product.stock : undefined,
                                    is_bundle: product.is_bundle,
                                    is_stockable: product.is_stockable,
                                  };
                                  // Add to order with the selected quantity
                                  for (let i = 0; i < qty; i++) {
                                    addToOrder(item);
                                  }
                                  // Reset quantity after adding
                                  setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: 1 });
                                } catch (err) {
                                  console.error('Error adding product:', err);
                                }
                              }}
                              className="w-28 bg-brand-600 hover:bg-brand-700 text-white py-1.5 rounded-lg transition-colors flex items-center justify-center disabled:bg-[#f7a57d] disabled:cursor-not-allowed"
                              title={containsArchivedIngredient(product) ? "Ingredient unavailable" : "Add to order"}
                              disabled={(typeof product.stock === 'number' ? product.stock <= 0 : false) || containsArchivedIngredient(product)}
                            >
                              {containsArchivedIngredient(product) ? (
                                <span className="text-xs">Unavailable</span>
                              ) : (typeof product.stock === 'number' && product.stock <= 0 ? (
                                <span className="text-xs">Out of Stock</span>
                              ) : (
                                <ShoppingCart className="w-4 h-4" />
                              ))}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                      })}
                    </div>
                    
                    {/* Pagination Controls */}
                    {bestSellers.length > itemsPerPage && (
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setBestSellersPage(prev => Math.max(0, prev - 1))}
                          disabled={bestSellersPage === 0}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          ← Previous
                        </button>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Page {bestSellersPage + 1} of {Math.ceil(bestSellers.length / itemsPerPage)}
                        </div>
                        <button
                          onClick={() => setBestSellersPage(prev => Math.min(Math.ceil(bestSellers.length / itemsPerPage) - 1, prev + 1))}
                          disabled={bestSellersPage >= Math.ceil(bestSellers.length / itemsPerPage) - 1}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No best sellers available
                  </div>
                )}
              </div>
            </ComponentCard>
          )}

          {/* Meals Section - Only show when All category is selected */}
          {activeCategory === 'all' && (
            <ComponentCard 
              title={<div className="flex items-center justify-between w-full">
                <span>🍽️ Meals</span>
                <span className="text-sm text-gray-400">Delicious meal options</span>
              </div>} 
              className="w-full"
            >
              <div className="space-y-4">
                {mealsLoading ? (
                  <div className="grid grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 animate-pulse">
                        <div className="h-40 bg-gray-200 dark:bg-gray-700"></div>
                        <div className="p-3 space-y-2">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                          <div className="flex items-center justify-center gap-2 mt-2">
                            <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                            <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                          </div>
                          <div className="flex justify-center mt-2">
                            <div className="w-28 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : meals.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-4">
                      {meals.slice(mealsPage * itemsPerPage, (mealsPage + 1) * itemsPerPage).map((product: any) => {
                    const imgUrl = product.image_url || (product.image ? `/storage/${product.image}` : null);
                    const qty = mealsQuantities[product.id] || 1;
                    
                    // Handle bundle stock display with real-time cart calculation
                    const isNonStockable = product.is_stockable === false || product.is_stockable === 0;
                    const baseStock = typeof product.stock === 'number' ? product.stock : 999;
                    let displayStock = baseStock;
                    let isOutOfStock = false;
                    
                    if (product.is_bundle) {
                      // For bundles, calculate available stock based on components in real-time
                      const components = mealsBundleComponents[product.id];
                      if (components && components.length > 0) {
                        let minBundleStock = Infinity;
                        for (const comp of components) {
                          const compProduct = meals.find(p => p.id === comp.id);
                          if (compProduct && (compProduct.is_stockable !== false && compProduct.is_stockable !== 0)) {
                            const compBaseStock = typeof compProduct.stock === 'number' ? compProduct.stock : 0;
                            const compAvailableStock = getMealAvailableStock(comp.id, compBaseStock);
                            const possibleBundles = Math.floor(compAvailableStock / comp.quantity);
                            minBundleStock = Math.min(minBundleStock, possibleBundles);
                          }
                        }
                        displayStock = minBundleStock === Infinity ? baseStock : minBundleStock;
                      } else {
                        displayStock = product.calculated_stock ?? baseStock;
                      }
                      isOutOfStock = displayStock <= 0;
                    } else if (!isNonStockable) {
                      // For regular stockable items, use real-time available stock
                      displayStock = getMealAvailableStock(product.id, baseStock);
                      isOutOfStock = displayStock <= 0;
                    } else {
                      // For non-stockable items (like rice)
                      isOutOfStock = false;
                    }
                    
                    return (
                      <div 
                        key={product.id} 
                        className="relative bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700 group"
                      >
                        <div className="h-40 bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                          {imgUrl ? (
                            <img 
                              src={imgUrl} 
                              alt={product.product_name || product.name} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="text-gray-400 dark:text-gray-600">No image</div>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <h4 className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 min-h-[2.5rem]">
                            {product.product_name || product.name}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {typeof product.category === 'string' ? product.category : product.category?.category_name || 'Uncategorized'}
                          </p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            ₱{Number(product.price || 0).toFixed(2)}
                          </p>
                          {product.status === 'archived' ? (
                            <p className="text-xs text-red-500 dark:text-red-400 font-semibold">Archived</p>
                          ) : containsArchivedIngredient(product) && product.is_bundle ? (
                            <p className="text-xs text-red-500 dark:text-red-400 font-semibold">Unavailable</p>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Stock: {product.is_bundle 
                                ? displayStock 
                                : (product.is_stockable === false || product.is_stockable === 0)
                                  ? '∞' 
                                  : (typeof product.stock === 'number' ? product.stock : '∞')
                              }
                            </p>
                          )}

                          <div className="flex items-center justify-center gap-2 mt-2">
                            <button
                              onClick={() => setMealsQuantities({ ...mealsQuantities, [product.id]: Math.max(1, qty - 1) })}
                              disabled={qty <= 1}
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-10 text-center text-sm font-semibold text-gray-800 dark:text-white">{qty}</span>
                            <button
                              onClick={() => {
                                if (product.is_bundle) {
                                  setMealsQuantities({ ...mealsQuantities, [product.id]: Math.min(displayStock, qty + 1) });
                                } else if (product.is_stockable === false || product.is_stockable === 0) {
                                  setMealsQuantities({ ...mealsQuantities, [product.id]: qty + 1 });
                                } else {
                                  const maxStock = typeof product.stock === 'number' ? product.stock : 999;
                                  setMealsQuantities({ ...mealsQuantities, [product.id]: Math.min(maxStock, qty + 1) });
                                }
                              }}
                              disabled={product.is_bundle ? qty >= displayStock : (!isNonStockable && typeof product.stock === 'number' && qty >= product.stock)}
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex justify-center mt-2">
                            <button
                              onClick={() => {
                                try {
                                  const item = {
                                    id: product.id,
                                    productName: String(product.product_name ?? product.name ?? ""),
                                    category: typeof product.category === 'string' ? product.category : product.category?.category_name ?? 'Uncategorized',
                                    category_id: product.category_id ?? null,
                                    price: Number(product.price || 0),
                                    image: product.image_url || (product.image ? `/storage/${product.image}` : null),
                                    stock: typeof product.stock === 'number' ? product.stock : undefined,
                                    is_bundle: product.is_bundle,
                                    is_stockable: product.is_stockable,
                                  };
                                  for (let i = 0; i < qty; i++) {
                                    addToOrder(item);
                                  }
                                  setMealsQuantities({ ...mealsQuantities, [product.id]: 1 });
                                } catch (err) {
                                  console.error('Error adding product:', err);
                                }
                              }}
                              className="w-28 bg-brand-600 hover:bg-brand-700 text-white py-1.5 rounded-lg transition-colors flex items-center justify-center disabled:bg-[#f7a57d] disabled:cursor-not-allowed"
                              title={containsArchivedIngredient(product) ? "Ingredient unavailable" : "Add to order"}
                              disabled={isOutOfStock || containsArchivedIngredient(product)}
                            >
                              {containsArchivedIngredient(product) ? (
                                <span className="text-xs">Unavailable</span>
                              ) : (isOutOfStock ? (
                                <span className="text-xs">Out of Stock</span>
                              ) : (
                                <ShoppingCart className="w-4 h-4" />
                              ))}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                      })}
                    </div>
                    
                    {/* Pagination Controls */}
                    {meals.length > itemsPerPage && (
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setMealsPage(prev => Math.max(0, prev - 1))}
                          disabled={mealsPage === 0}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          ← Previous
                        </button>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Page {mealsPage + 1} of {Math.ceil(meals.length / itemsPerPage)}
                        </div>
                        <button
                          onClick={() => setMealsPage(prev => Math.min(Math.ceil(meals.length / itemsPerPage) - 1, prev + 1))}
                          disabled={mealsPage >= Math.ceil(meals.length / itemsPerPage) - 1}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No meals available
                  </div>
                )}
              </div>
            </ComponentCard>
          )}

          {/* Available Products Section */}
          <ComponentCard title={<div className="flex items-center justify-between w-full"><span>Available Products</span><span className="text-sm text-gray-400">Browse and add items to your order</span></div>} className="w-full">
            <div className="w-full">
              <ProductGrid />
            </div>
          </ComponentCard>
        </div>

        {/* Right Sidebar */}
        <SelectedSidebar isOpen={isOpen} toggleSidebar={toggleSidebar} onPcNumberChange={setPcNumber} onSessionIdChange={setCurrentSessionId} />
        
        {/* Order Details Modal */}
        {showOrderDetails && (
          <div
            onClick={() => setShowOrderDetails(false)}
            className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4"
            style={{ margin: 0, padding: '1rem' }}
          >
            <div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-500 to-red-500">
                <h2 className="text-xl font-bold text-white">Pending Order Details</h2>
                <button
                  onClick={() => setShowOrderDetails(false)}
                  className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              
              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                <div className="space-y-4">
                  {pendingOrders.map((order) => (
                    <div key={order.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-gray-600">
                        <span className="text-gray-900 dark:text-white font-bold text-lg">
                          {order.order_alias || `Order #${order.id}`}
                        </span>
                        <span className="text-orange-600 dark:text-orange-400 font-bold text-lg">
                          ₱{parseFloat(order.total_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(order.order_items || []).map((item: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
                              <div className="flex items-center gap-2">
                                <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-semibold px-2 py-0.5 rounded text-sm">
                                  {item.quantity}×
                                </span>
                                <span className="font-medium">{item.product?.product_name || item.product?.name || 'Product'}</span>
                              </div>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                ₱{(parseFloat(item.price || 0) * item.quantity).toFixed(2)}
                              </span>
                            </div>
                            {(() => {
                              // Handle both camelCase (from state) and snake_case (from API)
                              const prefs = item.cookingPreferences || item.cooking_preferences;
                              const hasPrefs = prefs && typeof prefs === 'object' && Object.values(prefs).some((v: any) => typeof v === 'number' && v > 0);
                              return hasPrefs ? (
                                <div className="text-xs ml-2 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border-l-2 border-amber-500">
                                  <span className="font-semibold text-amber-700 dark:text-amber-400">🍳 Egg Breakdown:</span>
                                  <div className="mt-0.5 space-y-0">
                                    {(prefs?.['Sunny Side Up'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Sunny Side Up: {prefs['Sunny Side Up']}</div>}
                                    {(prefs?.['Boiled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Boiled: {prefs['Boiled']}</div>}
                                    {(prefs?.['Scrambled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Scrambled: {prefs['Scrambled']}</div>}
                                  </div>
                                </div>
                              ) : item.notes ? (
                                <div className="text-xs ml-2 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border-l-2 border-amber-500">
                                  <span className="font-semibold">🍳 Notes:</span> {item.notes}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Items: <span className="font-semibold text-gray-900 dark:text-white">{pendingOrders.reduce((s,o) => s + (o.order_items?.length || 0), 0)}</span>
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  Total: <span className="text-orange-600 dark:text-orange-400">₱{pendingOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        

      </div>
    </div>
  );

  return (
    <div>
      {content}
    </div>
  );
}
