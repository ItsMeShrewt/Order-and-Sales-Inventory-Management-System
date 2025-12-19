import { X, Plus, Minus, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";
import api from "../lib/axios";
import Swal from "sweetalert2";
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

interface AdminSidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

/**
 * AdminSelectedSidebar - Simplified sidebar for admin with NO PC locking
 * Admins can use any PC number freely without restrictions
 */
const AdminSelectedSidebar: React.FC<AdminSidebarProps> = ({ isOpen, toggleSidebar }) => {
  const { orders, updateQuantity, updateNotes, updateCookingPreferences, removeFromOrder, clearOrders } = useOrders();
  const hasOrders = orders && orders.length > 0;
  
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productStocks, setProductStocks] = useState<Record<number, number>>({});
  const [bundleComponents, setBundleComponents] = useState<Record<number, Array<{id: number, quantity: number}>>>({});
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  
  // Generate unique session ID for admin
  const [sessionId] = useState(() => `admin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  // Track scroll position to show/hide floating button
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setShowFloatingButton(scrollPosition > 200);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load products and inventory
  useEffect(() => {
    let mounted = true;
    const loadProducts = async () => {
      try {
        const [prodRes, invRes] = await Promise.all([
          api.get('/products'),
          api.get('/inventories')
        ]);
        if (!mounted) return;
        
        const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
        
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
        console.error('Failed to load products:', e);
      }
    };
    
    loadProducts();
    return () => { mounted = false; };
  }, []);

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

  const canPlaceOrder = hasOrders && !hasMissingPreferences;

  // Check if we can increase quantity
  const canIncreaseQuantity = (order: OrderItem): boolean => {
    if (!order.is_stockable && !order.is_bundle) {
      return true;
    }
    
    if (order.is_bundle) {
      const bundleStock = order.stock ?? productStocks[order.id] ?? 0;
      return order.quantity < bundleStock;
    }
    
    const baseStock = order.stock ?? productStocks[order.id] ?? 0;
    return order.quantity < baseStock;
  };

  const confirmOrder = async () => {
    if (!hasOrders) return;
    
    console.log('✅ ADMIN COUNTER ORDER: Creating walk-in/counter order', { sessionId });
    
    setSubmitting(true);
    try {
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
        pc_number: 'COUNTER', // Admin orders are counter/walk-in orders
        session_id: sessionId,
      };

      await api.post('/orders', payload);
      toggleSidebar();

      // Close any open dialog and fix overlays
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

      await Swal.fire({
        title: 'Order Placed!',
        text: 'Counter order has been successfully created.',
        icon: 'success',
        timer: 2000,
        confirmButtonColor: '#3b82f6',
        willOpen: () => {
          const container = document.querySelector('.swal2-container') as HTMLElement | null;
          if (container) container.style.zIndex = '300000';
          setTimeout(() => { try { (document.querySelector('.swal2-confirm') as HTMLElement | null)?.focus(); } catch (e) {} }, 50);
        }
      });

      try { restoreOverlays(modified); } catch (e) { /* ignore */ }

      clearOrders();
      setSubmitting(false);
    } catch (err: any) {
      console.error('Order failed:', err);
      setSubmitting(false);
      
      const errorMsg = err?.response?.data?.message || 'Failed to place order. Please try again.';
      
      const modified2: HTMLElement[] = [];
      try {
        const candidates = Array.from(document.querySelectorAll('div.fixed.inset-0, [role="dialog"]')) as HTMLElement[];
        for (const el of candidates) {
          if (el.classList && el.classList.contains('swal2-container')) continue;
          try { el.style.pointerEvents = 'none'; modified2.push(el); } catch (er) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      await Swal.fire({
        title: 'Order Failed',
        text: errorMsg,
        icon: 'error',
        confirmButtonColor: '#ef4444',
        willOpen: () => {
          const container = document.querySelector('.swal2-container') as HTMLElement | null;
          if (container) container.style.zIndex = '300000';
          setTimeout(() => { try { (document.querySelector('.swal2-confirm') as HTMLElement | null)?.focus(); } catch (e) {} }, 50);
        }
      });

      try {
        for (const el of modified2) {
          try { el.style.pointerEvents = ''; } catch (er) { }
        }
      } catch (e) { /* ignore */ }
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
          {/* Admin notice */}
          <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
            <strong>Counter Service:</strong> All admin orders are counter/walk-in orders. PC users order automatically through their terminals.
          </div>
        </div>

        {/* Orders list with fixed height for 4 items */}
        <div className="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
            <div className="space-y-4">
              {orders.length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No items in cart
                </p>
              )}
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
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 mb-1">
                        {order.category || 'Uncategorized'}
                      </span>
                      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 truncate">
                        {order.productName}
                      </h4>
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
                onClick={() => {
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
                  
                  {/* Counter Order Info */}
                  <div className="mt-4 p-4 bg-gradient-to-r from-brand-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-brand-200 dark:border-gray-600">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-brand-600 rounded-full flex items-center justify-center">
                        <span className="text-2xl">🏪</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Counter Order</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Walk-in customer order at the counter</p>
                      </div>
                    </div>
                    <div className="mt-3 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-brand-300 dark:border-gray-600">
                      <p className="text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Order Type:</span>{' '}
                        <span className="font-bold text-lg text-brand-600 dark:text-brand-400">COUNTER</span>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      💡 This order is for walk-in customers who order at the counter. PC users will order through their terminals automatically.
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
                      disabled={!hasOrders || submitting}
                      aria-disabled={!hasOrders || submitting}
                      onClick={confirmOrder}
                      className={`px-4 py-2 font-medium rounded-lg transition-colors text-white ${
                        hasOrders
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

export default AdminSelectedSidebar;
