import { useEffect, useState, useRef } from 'react';
import api from '../../lib/axios';
import {
  BoxIconLine,
  ShoppingBasketIcon,
  HorizontaLDots,
} from "../../icons";

type TimePeriod = 'day' | 'week' | 'month' | 'year';

export default function EcommerceMetrics() {
  const [productsCount, setProductsCount] = useState<number>(0);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [itemsTimePeriod, setItemsTimePeriod] = useState<TimePeriod>('day');
  const [ordersTimePeriod, setOrdersTimePeriod] = useState<TimePeriod>('day');
  const [itemsMenuOpen, setItemsMenuOpen] = useState(false);
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false);
  const itemsMenuRef = useRef<HTMLDivElement>(null);
  const ordersMenuRef = useRef<HTMLDivElement>(null);

  const getWeekStart = (dateStr: string): string => {
    // Parse date string as YYYY-MM-DD
    const parts = dateStr.split('T')[0].split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const dt = new Date(year, month, day);
    const dayOfWeek = dt.getDay(); // 0 Sun - 6 Sat
    const diff = ((dayOfWeek + 6) % 7);
    dt.setDate(dt.getDate() - diff);
    // Format the date back as YYYY-MM-DD without timezone conversion
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  // Helper function to check if an order is from today's business day (8am to 2am)
  const isTodayOrder = (orderDate: string): boolean => {
    const orderTime = new Date(orderDate);
    const now = new Date();
    
    // Get current business day start (8am today or 8am yesterday if before 2am)
    let businessDayStart = new Date(now);
    if (now.getHours() < 2) {
      // Before 2am - business day started yesterday at 8am
      businessDayStart.setDate(now.getDate() - 1);
    }
    businessDayStart.setHours(8, 0, 0, 0);
    
    // Get business day end (2am next day)
    const businessDayEnd = new Date(businessDayStart);
    businessDayEnd.setDate(businessDayStart.getDate() + 1);
    businessDayEnd.setHours(2, 0, 0, 0);
    
    return orderTime >= businessDayStart && orderTime < businessDayEnd;
  };

  const fetchMetrics = async (itemsPeriod: TimePeriod, ordersPeriod: TimePeriod) => {
    try {
      setLoading(true);
      // Fetch completed orders specifically
      const res = await api.get('/orders/completed');
      const orders = Array.isArray(res.data) ? res.data : res.data.data || [];
      
      // Calculate current period keys
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const thisWeekStart = getWeekStart(todayStr);
      const thisMonthStr = now.toISOString().slice(0, 7);
      const thisYear = String(now.getFullYear());
      
      // Filter items sold based on period
      let totalQuantity = 0;
      for (const order of orders) {
        const dateStr = order.order_date || order.created_at;
        const orderDateStr = dateStr.split('T')[0];
        let matches = false;
        
        if (itemsPeriod === 'day') {
          // Use business day (8am to 2am) for daily count
          matches = isTodayOrder(dateStr);
        } else if (itemsPeriod === 'week') {
          matches = getWeekStart(orderDateStr) === thisWeekStart;
        } else if (itemsPeriod === 'month') {
          matches = orderDateStr.slice(0, 7) === thisMonthStr;
        } else if (itemsPeriod === 'year') {
          matches = orderDateStr.slice(0, 4) === thisYear;
        }
        
        if (matches) {
          const items = order?.order_items || order?.orderItems || [];
          for (const item of items) {
            totalQuantity += Number(item.quantity ?? 0);
          }
        }
      }
      
      // Filter orders based on period
      let filteredOrdersCount = 0;
      for (const order of orders) {
        const dateStr = order.order_date || order.created_at;
        const orderDateStr = dateStr.split('T')[0];
        let matches = false;
        
        if (ordersPeriod === 'day') {
          // Use business day (8am to 2am) for daily count
          matches = isTodayOrder(dateStr);
        } else if (ordersPeriod === 'week') {
          matches = getWeekStart(orderDateStr) === thisWeekStart;
        } else if (ordersPeriod === 'month') {
          matches = orderDateStr.slice(0, 7) === thisMonthStr;
        } else if (ordersPeriod === 'year') {
          matches = orderDateStr.slice(0, 4) === thisYear;
        }
        
        if (matches) {
          filteredOrdersCount++;
        }
      }
      
      setProductsCount(totalQuantity);
      setOrdersCount(filteredOrdersCount);
    } catch (err) {
      console.error('Failed to load metrics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics(itemsTimePeriod, ordersTimePeriod);
  }, [itemsTimePeriod, ordersTimePeriod]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {loading ? (
        <>
          {/* Skeleton for Items Sold Card */}
          <div className="rounded-2xl border border-gray-200 bg-blue-50 dark:bg-blue-900/10 p-6 dark:border-gray-800 shadow-sm animate-pulse">
            <div className="flex items-start justify-between">
              <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
            </div>
          </div>

          {/* Skeleton for Orders Card */}
          <div className="rounded-2xl border border-gray-200 bg-emerald-50 dark:bg-emerald-900/10 p-6 dark:border-gray-800 shadow-sm animate-pulse">
            <div className="flex items-start justify-between">
              <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-28"></div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* <!-- Items Sold Card Start --> */}
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/10 dark:to-blue-900/5 p-6 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between">
              <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl dark:from-blue-900/20 dark:to-blue-800/20">
                <ShoppingBasketIcon className="text-blue-600 size-7 dark:text-blue-400" />
              </div>
          
          {/* Three-dot menu for Items */}
          <div className="relative" ref={itemsMenuRef}>
            <button
              onClick={() => setItemsMenuOpen(!itemsMenuOpen)}
              className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Time period options"
            >
              <HorizontaLDots className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            
            {itemsMenuOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                <button
                  onClick={() => { setItemsTimePeriod('day'); setItemsMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${itemsTimePeriod === 'day' ? 'bg-blue-100 dark:bg-blue-900/50 font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} transition-colors ${itemsTimePeriod === 'day' ? '' : 'rounded-t-lg'}`}
                >
                  This Day
                </button>
                <button
                  onClick={() => { setItemsTimePeriod('week'); setItemsMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${itemsTimePeriod === 'week' ? 'bg-blue-100 dark:bg-blue-900/50 font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} transition-colors`}
                >
                  This Week
                </button>
                <button
                  onClick={() => { setItemsTimePeriod('month'); setItemsMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${itemsTimePeriod === 'month' ? 'bg-blue-100 dark:bg-blue-900/50 font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} transition-colors`}
                >
                  This Month
                </button>
                <button
                  onClick={() => { setItemsTimePeriod('year'); setItemsMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${itemsTimePeriod === 'year' ? 'bg-blue-100 dark:bg-blue-900/50 font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'} transition-colors rounded-b-lg`}
                >
                  This Year
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Items Sold
          </span>
          <h4 className="mt-2 font-bold text-2xl text-gray-900 dark:text-white">
            {productsCount.toLocaleString()}
          </h4>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            {itemsTimePeriod === 'day' ? 'Today' : itemsTimePeriod === 'week' ? 'This week' : itemsTimePeriod === 'month' ? 'This month' : 'This year'}
          </p>
        </div>
      </div>
      {/* <!-- Items Sold Card End --> */}

      {/* <!-- Orders Card Start --> */}
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/5 p-6 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className="flex items-start justify-between">
          <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl dark:from-emerald-900/20 dark:to-emerald-800/20">
            <BoxIconLine className="text-emerald-600 size-7 dark:text-emerald-400" />
          </div>
          
          {/* Three-dot menu for Orders */}
          <div className="relative" ref={ordersMenuRef}>
            <button
              onClick={() => setOrdersMenuOpen(!ordersMenuOpen)}
              className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
              title="Time period options"
            >
              <HorizontaLDots className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            
            {ordersMenuOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                <button
                  onClick={() => { setOrdersTimePeriod('day'); setOrdersMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 ${ordersTimePeriod === 'day' ? 'bg-emerald-100 dark:bg-emerald-900/50 font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'} transition-colors ${ordersTimePeriod === 'day' ? '' : 'rounded-t-lg'}`}
                >
                  This Day
                </button>
                <button
                  onClick={() => { setOrdersTimePeriod('week'); setOrdersMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 ${ordersTimePeriod === 'week' ? 'bg-emerald-100 dark:bg-emerald-900/50 font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'} transition-colors`}
                >
                  This Week
                </button>
                <button
                  onClick={() => { setOrdersTimePeriod('month'); setOrdersMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 ${ordersTimePeriod === 'month' ? 'bg-emerald-100 dark:bg-emerald-900/50 font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'} transition-colors`}
                >
                  This Month
                </button>
                <button
                  onClick={() => { setOrdersTimePeriod('year'); setOrdersMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 ${ordersTimePeriod === 'year' ? 'bg-emerald-100 dark:bg-emerald-900/50 font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'} transition-colors rounded-b-lg`}
                >
                  This Year
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Orders
          </span>
          <h4 className="mt-2 font-bold text-2xl text-gray-900 dark:text-white">
            {ordersCount.toLocaleString()}
          </h4>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            {ordersTimePeriod === 'day' ? 'Completed today' : ordersTimePeriod === 'week' ? 'Completed this week' : ordersTimePeriod === 'month' ? 'Completed this month' : 'Completed this year'}
          </p>
        </div>
      </div>
      {/* <!-- Orders Card End --> */}
        </>
      )}
    </div>
  );
}
