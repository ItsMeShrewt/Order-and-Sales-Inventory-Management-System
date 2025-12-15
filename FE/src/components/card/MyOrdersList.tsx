import { useEffect, useState } from "react";
import Badge from "../ui/badge/Badge";
import api from "../../lib/axios";

interface Order {
  id: number;
  order_alias?: string;
  created_at: string;
  total_amount: number;
  sale?: any;
  order_items?: any[];
}

interface MyOrdersListProps {
  pcNumber: string;
  sessionId?: string; // Optional: filter by session
}

export default function MyOrdersList({ pcNumber, sessionId }: MyOrdersListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // Get the active PC for this window (the PC this window has locked)
      const activePc = sessionStorage.getItem('active_pc');
      
      // Check if this is an admin session
      const isAdmin = sessionStorage.getItem('admin_session_id') || localStorage.getItem('api_token');
      
      console.log('[MyOrdersList] Loading orders:', { pcNumber, sessionId, activePc, isAdmin: !!isAdmin });
      
      // For regular users: only show orders if they have an active_pc OR if using sessionId
      if (!isAdmin && !activePc && !sessionId) {
        console.log('[MyOrdersList] User has no active_pc and no sessionId - showing empty');
        setOrders([]);
        setLoading(false);
        return;
      }
      
      // If sessionId provided, fetch orders by session, otherwise by PC
      const endpoint = sessionId 
        ? `/orders/by-session/${sessionId}`
        : `/orders/by-pc/${pcNumber}`;
      
      const res = await api.get(endpoint);
      const orderList: Order[] = Array.isArray(res.data) ? res.data : res.data.data || [];
      
      // Filter pending orders
      let pendingOrders = orderList.filter(order => !order.sale);
      
      console.log('[MyOrdersList] All pending orders from API:', pendingOrders.length);
      
      // For regular users (non-admin), filter by active PC only
      if (!isAdmin) {
        // ONLY show orders for the active_pc (the PC this window actually owns)
        // Don't show orders just because dropdown is set to that PC
        if (activePc) {
          pendingOrders = pendingOrders.filter(order => {
            // Extract PC number from order alias
            const alias = order.order_alias || '';
            const match = alias.match(/PC-(\d+)/);
            const orderPc = match ? match[1] : null;
            
            return orderPc === activePc;
          });
          
          console.log('[MyOrdersList] User: Showing orders for active PC-' + activePc + ':', pendingOrders.length);
        } else {
          // No active_pc means no orders placed yet - show nothing
          pendingOrders = [];
          console.log('[MyOrdersList] User: No active_pc, showing no orders');
        }
      } else {
        // Admin: show all pending orders for the selected PC
        pendingOrders = pendingOrders.filter(order => {
          const alias = order.order_alias || '';
          const match = alias.match(/PC-(\d+)/);
          const orderPc = match ? match[1] : null;
          return orderPc === pcNumber;
        });
        
        console.log('[MyOrdersList] Admin: Showing all PC-' + pcNumber + ' orders:', pendingOrders.length);
      }
      
      setOrders(pendingOrders);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    // Listen for order events and refresh from backend
    const handleOrderPlaced = () => {
      console.log('[MyOrdersList] Order placed event received');
      loadOrders();
    };
    
    const handleOrderConfirmed = () => {
      console.log('[MyOrdersList] Order confirmed event received');
      loadOrders();
    };
    
    const handleOrderCancelled = () => {
      console.log('[MyOrdersList] Order cancelled event received');
      loadOrders();
    };

    const handleStorageChange = (e: StorageEvent) => {
      // Listen for cross-window events
      if (e.key === 'app:order-placed' || e.key === 'order:confirmed' || e.key === 'order:cancelled') {
        console.log('[MyOrdersList] Storage change detected:', e.key);
        loadOrders();
      }
    };

    window.addEventListener('order:placed', handleOrderPlaced as EventListener);
    window.addEventListener('order:confirmed', handleOrderConfirmed as EventListener);
    window.addEventListener('order:cancelled', handleOrderCancelled as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('order:placed', handleOrderPlaced as EventListener);
      window.removeEventListener('order:confirmed', handleOrderConfirmed as EventListener);
      window.removeEventListener('order:cancelled', handleOrderCancelled as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pcNumber, sessionId]);

  if (loading && orders.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
          <div className="flex items-center gap-2">
            <span>My Orders</span>
            {orders.length > 0 && (
              <span className="relative inline-flex">
                <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75 animate-ping -top-1 -right-2" />
                <span className="relative inline-flex items-center justify-center h-4 w-4 rounded-full bg-red-600 text-white text-xs font-bold -top-1 -right-2">
                  {orders.length}
                </span>
              </span>
            )}
          </div>
        </h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">My Orders</h3>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No pending orders</p>
          <p className="text-sm mt-1">Your orders will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
        My Orders
      </h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {orders.map((order) => (
          <div
            key={order.id}
            className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-800 dark:text-white">
                {order.order_alias || `#${order.id}`}
              </span>
              <Badge size="sm" color="warning">
                Pending
              </Badge>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(order.created_at).toLocaleString()}</span>
              </div>
              {order.order_items && order.order_items.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Items:</div>
                  <div className="space-y-1 ml-2">
                    {order.order_items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span>{item.product?.product_name || item.product_name || item.name || `Product #${item.product_id}`}</span>
                        <span className="text-gray-500">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-800 dark:text-white pt-2">
                <span>Total:</span>
                <span>₱{Number(order.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
