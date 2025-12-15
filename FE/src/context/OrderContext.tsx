import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { toast } from 'sonner';

export interface OrderItem {
  id: number;
  productName: string;
  category: string;
  category_id?: string;
  price: number;
  quantity: number;
  image: string;
  stock?: number;
  is_bundle?: boolean;
  is_stockable?: boolean;
  notes?: string;
  eggCount?: number;
  cookingPreferences?: {
    "Sunny Side Up"?: number;
    "Boiled"?: number;
    "Scrambled"?: number;
  };
  cooking_preferences?: {
    "Sunny Side Up"?: number;
    "Boiled"?: number;
    "Scrambled"?: number;
  };
}

interface OrderContextType {
  orders: OrderItem[];
  addToOrder: (item: Omit<OrderItem, 'quantity'>) => void;
  updateQuantity: (id: number, change: number) => void;
  updateNotes: (id: number, notes: string) => void;
  updateEggCount: (id: number, count: number) => void;
  updateCookingPreferences: (id: number, preferences: { "Sunny Side Up"?: number; "Boiled"?: number; "Scrambled"?: number }) => void;
  removeFromOrder: (id: number) => void;
  clearOrders: () => void;
  getReservedStock: (productId: number) => number;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Generate a unique session ID for this window/tab
const getSessionId = () => {
  // Check if this window already has a session ID
  let sessionId = sessionStorage.getItem('cart_session_id');
  if (!sessionId) {
    // Generate a unique ID using timestamp + random number
    sessionId = `cart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('cart_session_id', sessionId);
  }
  return sessionId;
};

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessionId] = useState(getSessionId);
  const [orders, setOrders] = useState<OrderItem[]>(() => {
    // Initialize from sessionStorage (window-specific) instead of localStorage
    try {
      const saved = sessionStorage.getItem(`cart_orders_${sessionId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load cart from sessionStorage:', e);
    }
    return [];
  });

  // Save to sessionStorage whenever orders change (window-specific)
  useEffect(() => {
    try {
      sessionStorage.setItem(`cart_orders_${sessionId}`, JSON.stringify(orders));
    } catch (e) {
      console.error('Failed to save cart to sessionStorage:', e);
    }
  }, [orders, sessionId]);

  useEffect(() => {
    const handleClearOrders = () => {
      setOrders([]);
      try {
        sessionStorage.removeItem(`cart_orders_${sessionId}`);
      } catch (e) {
        console.error('Failed to clear cart from sessionStorage:', e);
      }
    };

    window.addEventListener('orders:clear', handleClearOrders as EventListener);
    return () => {
      window.removeEventListener('orders:clear', handleClearOrders as EventListener);
    };
  }, [sessionId]);

  const addToOrder = (item: Omit<OrderItem, 'quantity'>) => {
    setOrders(currentOrders => {
      const existingOrder = currentOrders.find(order => order.id === item.id);
      
      if (existingOrder) {
        // If item exists, increment quantity but don't exceed available stock
        // Check stock for both stockable items AND bundles
        if (existingOrder.is_stockable !== false || existingOrder.is_bundle) {
          const maxStock = existingOrder.stock ?? Infinity;
          if (existingOrder.quantity >= maxStock) {
            toast.error(`Cannot add more. Only ${maxStock} left in stock.`, { duration: 2000 });
            return currentOrders;
          }
        }

        toast.success(`Added another ${item.productName} to your order!`, { duration: 2000 });
        return currentOrders.map(order =>
          order.id === item.id
            ? { ...order, quantity: order.quantity + 1 }
            : order
        );
      }
      
      // If item doesn't exist, add it with quantity 1
      // Check stock for stockable items and bundles
      if ((item.is_stockable !== false || item.is_bundle) && typeof item.stock === 'number' && item.stock < 1) {
        toast.error(`Cannot add ${item.productName} — out of stock.`, { duration: 2000 });
        return currentOrders;
      }

      toast.success(`${item.productName} added to your order!`, { duration: 2000 });
      return [...currentOrders, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, change: number) => {
    setOrders(currentOrders => {
      const updatedOrders = currentOrders.map(order => {
        if (order.id === id) {
          const newQuantity = order.quantity + change;
          // Don't allow quantity to go below 1
          if (newQuantity < 1) return order;

          // Don't allow exceeding stock when increasing (skip for bundles and non-stockable items)
          if (change > 0 && !order.is_bundle && order.is_stockable !== false && typeof order.stock === 'number' && newQuantity > order.stock) {
            toast.error(`Cannot add more. Only ${order.stock} in stock.`, { duration: 2000 });
            return order;
          }

          // Show toast for quantity updates
          if (change > 0) {
            toast.success(`Added another ${order.productName}`, { duration: 2000 });
          } else if (newQuantity > 1) {
            toast(`${order.productName} quantity reduced`, { duration: 2000 });
          }

          return { ...order, quantity: newQuantity };
        }
        return order;
      });
      return updatedOrders;
    });
  };

  const updateNotes = (id: number, notes: string) => {
    setOrders(currentOrders => 
      currentOrders.map(order => 
        order.id === id ? { ...order, notes } : order
      )
    );
  };

  const updateEggCount = (id: number, count: number) => {
    setOrders(currentOrders => 
      currentOrders.map(order => 
        order.id === id ? { ...order, eggCount: Math.max(0, count) } : order
      )
    );
  };

  const updateCookingPreferences = (id: number, preferences: { "Sunny Side Up"?: number; "Boiled"?: number; "Scrambled"?: number }) => {
    setOrders(currentOrders => 
      currentOrders.map(order => 
        order.id === id ? { ...order, cookingPreferences: preferences } : order
      )
    );
  };

  const removeFromOrder = (id: number) => {
    setOrders(currentOrders => {
      const removed = currentOrders.find(o => o.id === id);
      if (removed) {
        toast(`${removed.productName} removed from your order`, { duration: 2000 });
      }
      return currentOrders.filter(order => order.id !== id);
    });
  };

  const clearOrders = () => {
    setOrders([]);
    try {
      sessionStorage.removeItem(`cart_orders_${sessionId}`);
    } catch (e) {
      console.error('Failed to clear cart from sessionStorage:', e);
    }
  };

  // Calculate how much stock is reserved for a specific product (including bundle components)
  const getReservedStock = (productId: number) => {
    let reserved = 0;
    
    for (const order of orders) {
      // Direct product orders
      if (order.id === productId) {
        reserved += order.quantity;
      }
      
      // Check if this product is part of any bundle in the cart
      // We'll need to fetch bundle data to know component products
      // For now, we'll dispatch an event that ProductGrid can listen to
    }
    
    return reserved;
  };

  return (
    <OrderContext.Provider value={{ orders, addToOrder, updateQuantity, updateNotes, updateEggCount, updateCookingPreferences, removeFromOrder, clearOrders, getReservedStock }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};