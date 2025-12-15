import React, { useEffect, useState, useMemo } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import api from "../../lib/axios";
import Swal from 'sweetalert2';
import Button from "../../components/ui/button/Button";
import OrderDetailsModal from "../../components/modals/OrderDetailsModal";
import OrderReceipt from "../../components/common/OrderReceipt";
import { Modal } from "../../components/ui/modal";
import { X } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';

type Order = {
  id: number;
  order_alias?: string;
  transaction_number?: string;
  created_at: string;
  total_amount: number;
  order_items?: any[];
  orderItems?: any[];
  sale?: any;
  customer?: { name?: string };
  customer_name?: string;
  user?: { name?: string };
  name?: string;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");
  const [tab, setTab] = useState<'queue'|'history'>('queue');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [todayPage, setTodayPage] = useState(0);
  const todayItemsPerPage = 10;
  const [pcCarouselScroll, setPcCarouselScroll] = useState(0);

  // load function used to fetch orders; callable for refresh after actions
  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/orders');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      setOrders(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    
    // Listen for order placement event from user_order page
    const handleOrderPlaced = (event?: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      console.log('[Orders] 📥 Order placed event received:', detail, '- Refreshing orders...');
      loadOrders();
    };
    
    // Listen for order cancellation to refresh billing queue
    const handleOrderCancelled = () => {
      console.log('[Orders] 📥 Order cancelled event received - Refreshing orders...');
      loadOrders();
    };
    
    // Listen for storage events for cross-tab/window communication
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'app:order-placed' || e.key === 'order:cancelled') {
        console.log('[Orders] 📥 Storage event detected:', e.key, '- Refreshing orders...');
        loadOrders();
      }
    };
    
    console.log('[Orders] 🎧 Setting up event listeners for order updates...');
    
    window.addEventListener('order:placed', handleOrderPlaced as EventListener);
    window.addEventListener('order:cancelled', handleOrderCancelled as EventListener);
    window.addEventListener('storage', handleStorageChange);
    
    console.log('[Orders] ✅ Event listeners registered');
    
    return () => {
      console.log('[Orders] 🧹 Cleaning up event listeners');
      window.removeEventListener('order:placed', handleOrderPlaced as EventListener);
      window.removeEventListener('order:cancelled', handleOrderCancelled as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);



  // Helper function to determine if an order is from today's business day (8am to 2am)
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

  // compute filtered lists
  const pending = useMemo(() => orders.filter(o => !o.sale), [orders]);
  const completed = useMemo(() => orders.filter(o => !!o.sale), [orders]);
  const todayOrders = useMemo(() => {
    if (!completed || !Array.isArray(completed)) return [];
    return completed.filter(o => o?.created_at && isTodayOrder(o.created_at));
  }, [completed]);
  
  const [viewOrderId, setViewOrderId] = useState<number | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    orderNumber: string;
    pcNumber: string;
    items: Array<{ productName: string; quantity: number; price: number; notes?: string }>;
    total: number;
    orderDate: string;
  } | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [stationModalOpen, setStationModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string>('');
  
  // Get unique stations for filter
  const stations = useMemo(() => {
    const uniqueStations = new Set<string>();
    completed.forEach(order => {
      const alias = order.order_alias || `#${order.id}`;
      // Check for Walk-In variations
      if (alias === 'WI' || alias === 'PC-WI' || alias.startsWith('WI-')) {
        uniqueStations.add('walkin');
      } else if (alias.startsWith('PC-')) {
        uniqueStations.add(alias);
      }
    });
    return Array.from(uniqueStations).sort((a, b) => {
      if (a === 'walkin') return -1;
      if (b === 'walkin') return 1;
      const numA = parseInt(a.replace('PC-', ''));
      const numB = parseInt(b.replace('PC-', ''));
      return numA - numB;
    });
  }, [completed]);

  // Get orders for selected station modal
  const stationOrders = useMemo(() => {
    if (!selectedStation) return [];
    if (selectedStation === 'all') {
      return completed;
    }
    if (selectedStation === 'walkin') {
      return completed.filter(order => {
        const alias = order.order_alias || `#${order.id}`;
        return alias === 'WI' || alias === 'PC-WI' || alias.startsWith('WI-');
      });
    }
    return completed.filter(order => order.order_alias === selectedStation);
  }, [completed, selectedStation]);

  // Calculate today's revenue safely
  const todayRevenue = useMemo(() => {
    if (!todayOrders || todayOrders.length === 0) return '0.00';
    const total = todayOrders.reduce((sum, order) => {
      // Calculate from order items if total_amount is 0
      let amount = typeof order.total_amount === 'number' ? order.total_amount : 0;
      if (amount === 0 && (order.order_items || order.orderItems)) {
        const items = order.order_items || order.orderItems || [];
        amount = items.reduce((itemSum: number, item: any) => {
          const itemTotal = (item.quantity || 0) * (item.price || 0);
          return itemSum + itemTotal;
        }, 0);
      }
      return sum + amount;
    }, 0);
    return total.toFixed(2);
  }, [todayOrders]);

  // confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  // NOTE: using SweetAlert2 for brief success/error notifications instead of an internal modal

  // Column definitions for pending orders
  const pendingColumns = useMemo<ColumnDef<Order>[]>(() => [
    {
      accessorKey: 'order_alias',
      header: 'Station/Type',
      cell: ({ row }) => {
        const alias = row.original.order_alias || `#${row.original.id}`;
        // Check if it's a walk-in order (WI, WI-, PC-WI, or anything with WI)
        if (alias === 'WI' || alias.includes('WI')) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-medium">
              <span>🚶</span>
              <span>WI</span>
            </span>
          );
        }
        // For PC stations, add PC- prefix if not already present
        const displayAlias = alias.startsWith('PC-') ? alias : `PC-${alias}`;
        return displayAlias;
      },
    },
    {
      accessorKey: 'transaction_number',
      header: 'Transaction #',
      cell: ({ row }) => row.original.transaction_number || '—',
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString(),
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => `₱${row.original.total_amount}`,
    },
    {
      accessorKey: 'items',
      header: 'Items',
      cell: ({ row }) => (row.original.order_items || row.original.orderItems || []).length,
    },
    {
      id: 'status',
      header: 'Status',
      cell: () => (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          Pending
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <Button size="xs" onClick={() => {
          setViewOrderId(row.original.id);
          setViewOpen(true);
        }}>View</Button>
      ),
    },
  ], []);

  // Column definitions for completed orders
  const completedColumns = useMemo<ColumnDef<Order>[]>(() => [
    {
      accessorKey: 'order_alias',
      header: 'Station/Type',
      cell: ({ row }) => {
        const alias = row.original.order_alias || `#${row.original.id}`;
        // Check if it's a walk-in order (WI, WI-, PC-WI, or anything with WI)
        if (alias === 'WI' || alias.includes('WI')) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-medium">
              <span>🚶</span>
              <span>WI</span>
            </span>
          );
        }
        // For PC stations, add PC- prefix if not already present
        const displayAlias = alias.startsWith('PC-') ? alias : `PC-${alias}`;
        return displayAlias;
      },
    },
    {
      accessorKey: 'transaction_number',
      header: 'Transaction #',
      cell: ({ row }) => row.original.transaction_number || '—',
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString(),
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => `₱${row.original.total_amount}`,
    },
    {
      accessorKey: 'items',
      header: 'Items',
      cell: ({ row }) => (row.original.order_items || row.original.orderItems || []).length,
    },
    {
      id: 'status',
      header: 'Status',
      cell: () => (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Completed
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => row.original.sale ? (
        <Button size="xs" onClick={() => {
          setViewOrderId(row.original.id);
          setViewOpen(true);
        }}>View</Button>
      ) : <span className="text-sm text-gray-500">—</span>,
    },
  ], []);

  // TanStack Table instances
  const pendingTable = useReactTable({
    data: pending,
    columns: pendingColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter: query,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setQuery,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // Table for completed orders - currently not displayed but kept for future use
  useReactTable({
    data: completed,
    columns: completedColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter: query,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setQuery,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const openConfirm = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await confirmAction();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Operation failed';
      await Swal.fire({
        title: 'Error',
        text: String(msg),
        icon: 'error',
        showConfirmButton: false,
        showCloseButton: false,
        timer: 1800,
        timerProgressBar: true,
        allowOutsideClick: true,
        willOpen: () => {
          const container = document.querySelector('.swal2-container') as HTMLElement | null;
          if (container) container.style.zIndex = '200000';
        }
      });
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
    }
  };
  return (
    <ErrorBoundary>
      <>
      <PageMeta
        title="Orders"
      />
      <PageBreadcrumb
        pageTitle="Orders"
      />

      <div className="max-w-3xl text-sm text-gray-600 dark:text-gray-400 mb-2">Manage current and historical orders — confirm, cancel and review order details.</div>

      <div className="space-y-6">
        <ComponentCard
          title={
            <div className="flex justify-between items-center">
              {loading ? (
                <div className="flex gap-2">
                  <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className={`px-3 py-1 rounded ${tab==='queue' ? 'bg-blue-500 text-white' : 'bg-white border'}`} onClick={() => setTab('queue')}>Billing Queue</button>
                  <button className={`px-3 py-1 rounded ${tab==='history' ? 'bg-blue-500 text-white' : 'bg-white border'}`} onClick={() => setTab('history')}>Order History</button>
                </div>
              )}
            </div>
          }
        >
          <div>
            {error && <div className="text-sm text-red-500">{error}</div>}

            {/* Toolbar: search and quick actions */}
            {loading ? (
              <div className="mb-4 mt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-[360px] h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                <div className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ml-auto"></div>
              </div>
            ) : (
              <div className="mb-4 mt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-[360px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 19l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(String(e.target.value ?? ""))}
                    placeholder="Search orders by #, customer, date or total..."
                    className="w-full pl-10 pr-3 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  {/*tab === 'queue' && pending.length > 0 && (
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={async () => {
                        // Helper functions to manage overlays
                        const disableTopOverlays = () => {
                          const modified: HTMLElement[] = [];
                          try {
                            const candidates = Array.from(document.querySelectorAll('div.fixed.inset-0, [role="dialog"]')) as HTMLElement[];
                            for (const el of candidates) {
                              if (el.classList && el.classList.contains('swal2-container')) continue;
                              try { el.style.pointerEvents = 'none'; modified.push(el); } catch (er) { }
                            }
                          } catch (e) { }
                          return modified;
                        };
                        
                        const restoreOverlays = (list: HTMLElement[]) => {
                          try { for (const el of list) { try { el.style.pointerEvents = ''; } catch (er) { } } } catch (e) { }
                        };
                        
                        const modified = disableTopOverlays();
                        
                        const result = await Swal.fire({
                          title: 'Confirm All Orders?',
                          text: `Are you sure you want to confirm all ${pending.length} pending orders?`,
                          icon: 'question',
                          showCancelButton: true,
                          confirmButtonText: 'Yes, Confirm All',
                          cancelButtonText: 'Cancel',
                          confirmButtonColor: '#3b82f6',
                          cancelButtonColor: '#6b7280',
                          willOpen: () => {
                            const container = document.querySelector('.swal2-container') as HTMLElement | null;
                            if (container) container.style.zIndex = '300000';
                          }
                        });
                        
                        restoreOverlays(modified);
                        
                        if (result.isConfirmed) {
                          const modified2 = disableTopOverlays();
                          
                          const loadingSwal = Swal.fire({
                            title: 'Confirming Orders...',
                            text: `Processing ${pending.length} orders...`,
                            allowOutsideClick: false,
                            didOpen: () => {
                              Swal.showLoading();
                              const container = document.querySelector('.swal2-container') as HTMLElement | null;
                              if (container) container.style.zIndex = '300000';
                            }
                          });
                          
                          let confirmed = 0;
                          let failed = 0;
                          
                          // Group orders by PC number to combine items
                          const ordersByPc: Record<string, typeof pending> = {};
                          
                          for (const order of pending) {
                            try {
                              await api.post(`/orders/${order.id}/confirm`);
                              confirmed++;
                              
                              // Group by PC number
                              const pcNumber = order.order_alias?.replace('PC-', '') || 'unknown';
                              if (!ordersByPc[pcNumber]) {
                                ordersByPc[pcNumber] = [];
                              }
                              ordersByPc[pcNumber].push(order);
                            } catch (err) {
                              failed++;
                              console.error(`Failed to confirm order ${order.id}:`, err);
                            }
                          }
                          
                          // Dispatch combined events for each PC (with delays to prevent overwriting)
                          let delayMs = 0;
                          for (const [pcNumber, pcOrders] of Object.entries(ordersByPc)) {
                            setTimeout(() => {
                              try {
                                // Combine all items from all orders for this PC
                                const allItems: any[] = [];
                                let totalAmount = 0;
                                const orderNumbers: string[] = [];
                                
                                pcOrders.forEach(order => {
                                  const orderItems = order.order_items || order.orderItems || [];
                                  orderItems.forEach((item: any) => {
                                    allItems.push({
                                      productName: item.product?.product_name || item.product?.name || 'Unknown Product',
                                      quantity: item.quantity || 1,
                                      price: parseFloat(item.price || 0),
                                      notes: item.notes
                                    });
                                  });
                                  totalAmount += parseFloat(order.total_amount || 0);
                                  orderNumbers.push(order.transaction_number || order.order_alias || `#${order.id}`);
                                });
                                
                                // Prepare combined receipt data
                                const receiptEventData = {
                                  orderId: pcOrders[0].id, // Use first order ID
                                  pcNumber,
                                  orderNumber: orderNumbers.join(', '), // Show all order numbers
                                  items: allItems,
                                  total: totalAmount,
                                  timestamp: Date.now()
                                };
                                
                                console.log('[Orders] 📤 Bulk confirm - Dispatching combined receipt for PC-' + pcNumber + ':', allItems.length, 'items from', pcOrders.length, 'orders');
                                
                                // Dispatch to same window
                                window.dispatchEvent(new CustomEvent('order:confirmed', {
                                  detail: receiptEventData
                                }));
                                
                                // Use PC-specific localStorage key to avoid conflicts
                                const storageKey = `order:confirmed:pc${pcNumber}`;
                                localStorage.setItem(storageKey, JSON.stringify(receiptEventData));
                                
                                // Trigger storage event manually for same window with PC-specific key
                                window.dispatchEvent(new StorageEvent('storage', {
                                  key: storageKey,
                                  newValue: JSON.stringify(receiptEventData),
                                  url: window.location.href,
                                  storageArea: localStorage
                                }));
                                
                                // Also use BroadcastChannel for more reliable cross-window communication
                                try {
                                  const channel = new BroadcastChannel('order-receipts');
                                  channel.postMessage({
                                    type: 'order:confirmed',
                                    detail: receiptEventData
                                  });
                                  channel.close();
                                  console.log('[Orders] 📻 Broadcast receipt via BroadcastChannel for PC-' + pcNumber);
                                } catch (e) {
                                  console.warn('[Orders] BroadcastChannel not available:', e);
                                }
                                
                                console.log('[Orders] ✅ Dispatched receipt event for PC-' + pcNumber + ' with key:', storageKey);
                              } catch (e) {
                                console.error('[Orders] Bulk confirm event error for PC', pcNumber, ':', e);
                              }
                            }, delayMs);
                            delayMs += 100; // Stagger events by 100ms
                          }
                          
                          Swal.close();
                          restoreOverlays(modified2);
                          await loadOrders();
                          
                          const modified3 = disableTopOverlays();
                          
                          if (failed === 0) {
                            await Swal.fire({
                              title: 'All Orders Confirmed!',
                              text: `Successfully confirmed ${confirmed} orders.`,
                              icon: 'success',
                              timer: 2000,
                              showConfirmButton: false,
                              willOpen: () => {
                                const container = document.querySelector('.swal2-container') as HTMLElement | null;
                                if (container) container.style.zIndex = '300000';
                              }
                            });
                          } else {
                            await Swal.fire({
                              title: 'Partially Confirmed',
                              text: `Confirmed: ${confirmed}, Failed: ${failed}`,
                              icon: 'warning',
                              confirmButtonText: 'OK',
                              willOpen: () => {
                                const container = document.querySelector('.swal2-container') as HTMLElement | null;
                                if (container) container.style.zIndex = '300000';
                              }
                            });
                          }
                          
                          restoreOverlays(modified3);
                        }
                      }}
                    >
                      Confirm All ({pending.length})
                    </Button>
                  )}*/}
                  <Button variant="outline" size="sm" onClick={() => loadOrders()}>Refresh</Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="px-5 py-4">
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : tab === 'queue' ? (
              <div>
                <h4 className="mb-3 text-sm font-medium">Pending Orders ({pendingTable.getFilteredRowModel().rows.length})</h4>
                {pendingTable.getFilteredRowModel().rows.length === 0 ? (
                  <div className="text-sm text-gray-600">No pending orders.</div>
                ) : (
                  <div className="max-w-full overflow-x-auto">
                    <div className="min-w-[800px]">
                      <table className="min-w-full">
                        <thead className="border-b border-gray-100 dark:border-white/[0.05]">
                          {pendingTable.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                              {headerGroup.headers.map(header => (
                                <th
                                  key={header.id}
                                  className="px-5 py-4 sm:px-6 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                                  onClick={header.column.getToggleSortingHandler()}
                                >
                                  <div className="flex items-center justify-center gap-2">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    {header.column.getIsSorted() && (
                                      <span className="text-xs">
                                        {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          ))}
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {pendingTable.getRowModel().rows.map(row => (
                            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                              {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="px-5 py-4 sm:px-6 text-center text-sm text-gray-600 dark:text-gray-400">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 dark:border-white/[0.04]">
                        <div className="text-sm text-gray-600">
                          Page {pendingTable.getState().pagination.pageIndex + 1} of {pendingTable.getPageCount()}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            onClick={() => pendingTable.previousPage()}
                            disabled={!pendingTable.getCanPreviousPage()}
                          >Prev</button>
                          {Array.from({ length: pendingTable.getPageCount() }).map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => pendingTable.setPageIndex(idx)}
                              className={`px-3 py-1 rounded text-sm ${idx === pendingTable.getState().pagination.pageIndex ? 'bg-blue-500 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
                            >{idx + 1}</button>
                          ))}
                          <button
                            className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            onClick={() => pendingTable.nextPage()}
                            disabled={!pendingTable.getCanNextPage()}
                          >Next</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : tab === 'history' ? (
              <div>
                {stations.length > 0 && (
                  <>
                    <h4 className="mb-4 text-sm font-medium">Completed Orders by Station</h4>
                    
                    {/* Station Buttons with Carousel Navigation */}
                    <div className="mb-6 relative">
                      {/* Left Navigation Button */}
                      {pcCarouselScroll > 0 && (
                        <button
                          onClick={() => {
                            const container = document.getElementById('pc-carousel');
                            if (container) {
                              container.scrollBy({ left: -300, behavior: 'smooth' });
                              setPcCarouselScroll(Math.max(0, pcCarouselScroll - 300));
                            }
                          }}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-md transition-all"
                          title="Previous"
                        >
                          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      )}

                      {/* Carousel Container */}
                      <div
                        id="pc-carousel"
                        className="overflow-x-auto px-12"
                        onScroll={(e) => setPcCarouselScroll(e.currentTarget.scrollLeft)}
                      >
                        <div className="flex gap-3 w-fit">
                          {/* Overall Grid Button */}
                          <button
                            onClick={() => {
                              setSelectedStation('all');
                              setStationModalOpen(true);
                            }}
                            className="flex flex-col items-center justify-center px-4 py-4 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all shadow-sm hover:shadow-md flex-shrink-0"
                          >
                            <div className="text-2xl mb-2">📊</div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Overall</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{completed.length} {completed.length === 1 ? 'order' : 'orders'}</div>
                            <span className="px-3 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700">
                              View All
                            </span>
                          </button>

                          {stations.map(station => {
                        if (station === 'walkin') {
                          const count = completed.filter(o => {
                            const alias = o.order_alias || `#${o.id}`;
                            return alias === 'WI' || alias === 'PC-WI' || alias.startsWith('WI-');
                          }).length;
                          return (
                            <button
                              key="walkin"
                              onClick={() => {
                                setSelectedStation('walkin');
                                setStationModalOpen(true);
                              }}
                              className="flex flex-col items-center justify-center px-4 py-4 rounded-lg border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all shadow-sm hover:shadow-md flex-shrink-0"
                            >
                              <div className="text-2xl mb-2">🚶</div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Walk-In</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{count} {count === 1 ? 'order' : 'orders'}</div>
                              <span className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700">
                                View All
                              </span>
                            </button>
                          );
                        }
                        const count = completed.filter(o => o.order_alias === station).length;
                        return (
                          <button
                            key={station}
                            onClick={() => {
                              setSelectedStation(station);
                              setStationModalOpen(true);
                            }}
                            className="flex flex-col items-center justify-center px-4 py-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all shadow-sm hover:shadow-md flex-shrink-0"
                          >
                            <div className="text-2xl mb-2">🖥️</div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{station}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{count} {count === 1 ? 'order' : 'orders'}</div>
                            <span className="px-3 py-1 text-xs bg-brand-600 text-white rounded-md hover:bg-brand-700">
                              View All
                            </span>
                          </button>
                        );
                          })}
                        </div>
                      </div>

                      {/* Right Navigation Button */}
                      <button
                        onClick={() => {
                          const container = document.getElementById('pc-carousel');
                          if (container) {
                            container.scrollBy({ left: 300, behavior: 'smooth' });
                            setPcCarouselScroll(pcCarouselScroll + 300);
                          }
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-md transition-all"
                        title="Next"
                      >
                        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Today's Orders Table */}
                    <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">📅 Today's Orders (8am - 2am)</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Total: {todayOrders?.length || 0} order{todayOrders?.length !== 1 ? 's' : ''} • Revenue: ₱{todayRevenue}
                        </p>
                      </div>
                      
                      {todayOrders.length === 0 ? (
                        <div className="text-sm text-blue-600 dark:text-blue-400 py-4 text-center">
                          No orders yet for today's business day.
                        </div>
                      ) : (
                        <div className="max-w-full overflow-x-auto">
                          <div className="min-w-[600px]">
                            <table className="min-w-full bg-white dark:bg-gray-900 rounded-lg">
                              <thead className="bg-blue-100 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                                <tr>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-blue-900 dark:text-blue-100">Station</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-blue-900 dark:text-blue-100">Transaction #</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-blue-900 dark:text-blue-100">Time</th>
                                  <th className="px-4 py-3 text-right text-sm font-semibold text-blue-900 dark:text-blue-100">Amount</th>
                                  <th className="px-4 py-3 text-center text-sm font-semibold text-blue-900 dark:text-blue-100">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-blue-100 dark:divide-blue-900/30">
                                {todayOrders
                                  .slice(todayPage * todayItemsPerPage, (todayPage + 1) * todayItemsPerPage)
                                  .map(order => {
                                    const alias = order.order_alias || `#${order.id}`;
                                    const isWalkIn = alias === 'WI' || alias.startsWith('WI-');
                                    
                                    return (
                                      <tr key={order.id} className="hover:bg-blue-50 dark:hover:bg-blue-900/10">
                                        <td className="px-4 py-3 text-sm">
                                          {isWalkIn ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-medium">
                                              🚶 Walk-In
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md font-medium">
                                              🖥️ {alias}
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                          {order.transaction_number || `#${order.id}`}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                          {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-700 dark:text-gray-300">
                                          ₱{(() => {
                                            let amount = typeof order.total_amount === 'number' ? order.total_amount : 0;
                                            if (amount === 0 && (order.order_items || order.orderItems)) {
                                              const items = order.order_items || order.orderItems || [];
                                              amount = items.reduce((sum: number, item: any) => sum + (item.quantity || 0) * (item.price || 0), 0);
                                            }
                                            return amount.toFixed(2);
                                          })()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <Button size="xs" onClick={() => {
                                            setViewOrderId(order.id);
                                            setViewOpen(true);
                                          }}>View</Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                            
                            {/* Pagination Controls */}
                            {todayOrders.length > todayItemsPerPage && (
                              <div className="mt-4 flex items-center justify-between px-4">
                                <div className="text-sm text-blue-700 dark:text-blue-300">
                                  Showing {todayPage * todayItemsPerPage + 1} to {Math.min((todayPage + 1) * todayItemsPerPage, todayOrders.length)} of {todayOrders.length} orders
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="xs"
                                    onClick={() => setTodayPage(p => Math.max(0, p - 1))}
                                    disabled={todayPage === 0}
                                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Previous
                                  </Button>
                                  <span className="text-sm text-blue-700 dark:text-blue-300">
                                    Page {todayPage + 1} of {Math.ceil(todayOrders.length / todayItemsPerPage)}
                                  </span>
                                  <Button
                                    size="xs"
                                    onClick={() => setTodayPage(p => Math.min(Math.ceil(todayOrders.length / todayItemsPerPage) - 1, p + 1))}
                                    disabled={todayPage >= Math.ceil(todayOrders.length / todayItemsPerPage) - 1}
                                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Next
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {stations.length === 0 && completed.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-5xl mb-4">📦</div>
                    <p className="text-gray-600 dark:text-gray-400">No completed orders yet.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </ComponentCard>
        
        {/* Station Orders Modal */}
        {stationModalOpen && (
          <>
            <style>{`
              .station-modal-backdrop {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                margin: 0 !important;
                padding: 0 !important;
                z-index: 999999 !important;
                overflow: auto !important;
              }
            `}</style>
            <div 
              className="station-modal-backdrop fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" 
              onClick={() => setStationModalOpen(false)}
            >
              <div 
                className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden relative z-[1000000]" 
                onClick={(e) => e.stopPropagation()}
              >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-brand-50 to-white dark:from-gray-800 dark:to-gray-900">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedStation === 'all' ? '📊 All Orders' : selectedStation === 'walkin' ? '🚶 Walk-In Orders' : `${selectedStation} Orders`}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {stationOrders.length} {stationOrders.length === 1 ? 'order' : 'orders'} found
                  </p>
                </div>
                <button
                  onClick={() => setStationModalOpen(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                {stationOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-5xl mb-4">📦</div>
                    <p className="text-gray-600 dark:text-gray-400">No orders found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transaction #</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Items</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {stationOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {order.transaction_number || '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {new Date(order.created_at).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                              ₱{Number(order.total_amount || 0).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {(order.order_items || order.orderItems || []).length}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button
                                size="xs"
                                onClick={() => {
                                  setViewOrderId(order.id);
                                  setViewOpen(true);
                                  setStationModalOpen(false);
                                }}
                              >
                                View Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
        )}
        
        <OrderDetailsModal 
          isOpen={viewOpen} 
          onClose={() => setViewOpen(false)} 
          orderId={viewOrderId}
          showActions={tab === 'queue'}
          onConfirmClick={() => {
            if (!viewOrderId) return;
            openConfirm('Confirm Order', 'Are you sure you want to confirm this order?', async () => {
              // Get the order details BEFORE making the API call
              const confirmedOrder = orders.find(o => o.id === viewOrderId);
              const orderIdToConfirm = String(viewOrderId);
              
              const res = await api.post(`/orders/${orderIdToConfirm}/confirm`);
              
              // Close the order details modal
              setViewOpen(false);
              setViewOrderId(null);
              
              // Refresh orders list immediately
              await loadOrders();
              
              // Prepare receipt data
              if (confirmedOrder) {
                const date = new Date(confirmedOrder.created_at);
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const year = String(date.getFullYear()).slice(-2);
                const hours24 = date.getHours();
                const hours12 = hours24 % 12 || 12;
                const ampm = hours24 >= 12 ? 'PM' : 'AM';
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const orderDate = `${month}/${day}/${year} ${String(hours12).padStart(2, '0')}:${minutes} ${ampm}`;
                
                const orderItems = confirmedOrder.order_items || confirmedOrder.orderItems || [];
                
                setReceiptData({
                  orderNumber: confirmedOrder.transaction_number || confirmedOrder.order_alias || `#${confirmedOrder.id}`,
                  pcNumber: confirmedOrder.order_alias || 'N/A',
                  items: orderItems.map((item: any) => ({
                    productName: item.product?.product_name || item.product?.name || 'Unknown Product',
                    quantity: item.quantity || 1,
                    price: parseFloat(item.price || 0),
                    notes: item.notes
                  })),
                  total: Number(confirmedOrder.total_amount || 0),
                  orderDate
                });
              }
              
              // Notify user_order pages to refresh their orders
              try {
                const pcNumber = confirmedOrder?.order_alias?.replace('PC-', '');
                const orderItemsList = confirmedOrder?.order_items || confirmedOrder?.orderItems || [];
                
                console.log('[Orders] 📤 Dispatching order:confirmed - PC number:', pcNumber, 'Order ID:', orderIdToConfirm, 'order_alias:', confirmedOrder?.order_alias, 'items count:', orderItemsList.length);
                
                // Prepare full order data for receipt
                const receiptEventData = {
                  orderId: Number(orderIdToConfirm),
                  pcNumber,
                  orderNumber: confirmedOrder?.transaction_number || confirmedOrder?.order_alias || `#${orderIdToConfirm}`,
                  items: orderItemsList.map((item: any) => ({
                    productName: item.product?.product_name || item.product?.name || 'Unknown Product',
                    quantity: item.quantity || 1,
                    price: parseFloat(item.price || 0),
                    notes: item.notes
                  })),
                  total: confirmedOrder ? Number(confirmedOrder.total_amount || 0) : 0,
                  timestamp: Date.now()
                };
                
                console.log('[Orders] 📦 Event data for PC-' + pcNumber + ':', receiptEventData);
                
                // Dispatch to same window
                window.dispatchEvent(new CustomEvent('order:confirmed', {
                  detail: receiptEventData
                }));
                
                // Use PC-specific localStorage key to ensure only correct window shows receipt
                const storageKey = `order:confirmed:pc${pcNumber}`;
                localStorage.setItem(storageKey, JSON.stringify(receiptEventData));
                console.log('[Orders] ✅ Event dispatched with PC-specific key:', storageKey);
                
                // Also use BroadcastChannel for more reliable cross-window communication
                try {
                  const channel = new BroadcastChannel('order-receipts');
                  channel.postMessage({
                    type: 'order:confirmed',
                    detail: receiptEventData
                  });
                  channel.close();
                  console.log('[Orders] 📻 Broadcast receipt via BroadcastChannel for PC-' + pcNumber);
                } catch (e) {
                  console.warn('[Orders] BroadcastChannel not available:', e);
                }
                
                // Trigger storage event manually for same window (storage event doesn't fire in same window)
                window.dispatchEvent(new StorageEvent('storage', {
                  key: storageKey,
                  newValue: JSON.stringify(receiptEventData),
                  url: window.location.href,
                  storageArea: localStorage
                }));
              } catch (e) {
                console.error('[Orders] ❌ Failed to dispatch order:confirmed event:', e);
              }
              
              // Show success alert FIRST
              await Swal.fire({
                title: 'Order confirmed',
                text: res.data?.message || 'Order confirmed successfully',
                icon: 'success',
                showConfirmButton: false,
                showCloseButton: false,
                timer: 1400,
                timerProgressBar: true,
                allowOutsideClick: true,
                willOpen: () => {
                  const container = document.querySelector('.swal2-container') as HTMLElement | null;
                  if (container) container.style.zIndex = '200000';
                }
              });
              
              // Show receipt AFTER the success alert
              setShowReceipt(true);
            });
          }}
          onCancelClick={() => {
            if (!viewOrderId) return;
            openConfirm('Cancel Order', 'Are you sure you want to cancel this order? This will restore stock and remove the order.', async () => {
              // Get the order details BEFORE making the API call
              const cancelledOrder = orders.find(o => o.id === viewOrderId);
              const orderIdToCancel = viewOrderId;
              
              const res = await api.patch(`/orders/${orderIdToCancel}/cancel`);
              
              // Close the order details modal
              setViewOpen(false);
              setViewOrderId(null);
              
              // Refresh orders list immediately
              await loadOrders();
              
              // Dispatch events to notify product pages to refresh their stock data in real-time
              window.dispatchEvent(new CustomEvent('products:refresh'));
              
              // Set localStorage for cross-window communication
              try {
                const pcNumber = cancelledOrder?.order_alias?.replace('PC-', '');
                console.log('[Orders] Order cancelled - PC number:', pcNumber, 'Order ID:', orderIdToCancel);
                window.dispatchEvent(new CustomEvent('order:cancelled', {
                  detail: { orderId: orderIdToCancel, pcNumber, timestamp: Date.now() }
                }));
                localStorage.setItem('order:cancelled', JSON.stringify({ 
                  orderId: orderIdToCancel, 
                  pcNumber,
                  timestamp: Date.now() 
                }));
                localStorage.setItem('products:refresh', JSON.stringify({ timestamp: Date.now() }));
              } catch (e) {
                console.debug('Failed to dispatch events:', e);
              }
              
              await Swal.fire({
                title: 'Order cancelled',
                text: res.data?.message || 'Order cancelled and stock restored',
                icon: 'success',
                showConfirmButton: false,
                showCloseButton: false,
                timer: 1400,
                timerProgressBar: true,
                allowOutsideClick: true,
                willOpen: () => {
                  const container = document.querySelector('.swal2-container') as HTMLElement | null;
                  if (container) container.style.zIndex = '200000';
                }
              });
            });
          }}
        />

        <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} className="max-w-lg p-6">
          <h3 className="text-lg font-semibold">{confirmTitle}</h3>
          <p className="mt-2 text-sm text-gray-600">{confirmMessage}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={runConfirmAction} className="bg-green-500 text-white" disabled={confirmLoading}>{confirmLoading ? 'Processing...' : 'Confirm'}</Button>
          </div>
        </Modal>

        {/* Receipt Modal */}
        {showReceipt && receiptData && (
          <div
            onClick={() => setShowReceipt(false)}
            className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4"
            style={{ margin: 0, padding: '1rem' }}
          >
              <div onClick={(e) => e.stopPropagation()} className="relative">
                <button
                  onClick={() => setShowReceipt(false)}
                  className="absolute -top-4 -right-4 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <OrderReceipt
                  orderNumber={receiptData.orderNumber}
                  pcNumber={receiptData.pcNumber}
                  items={receiptData.items}
                  total={receiptData.total}
                  orderDate={receiptData.orderDate}
                  onPrint={() => {
                    const printContent = document.getElementById('order-receipt');
                    if (printContent) {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title></title>
                              <style>
                                @page { 
                                  margin: 0; 
                                  size: 80mm auto;
                                }
                                * {
                                  box-sizing: border-box;
                                  -webkit-print-color-adjust: exact !important;
                                  print-color-adjust: exact !important;
                                  color-adjust: exact !important;
                                }
                                html, body { 
                                  margin: 0; 
                                  padding: 0;
                                  background: white;
                                  color: #000;
                                }
                                body { 
                                  font-family: 'Segoe UI', Arial, sans-serif; 
                                  padding: 8mm; 
                                  margin: 0;
                                }
                                #order-receipt {
                                  width: 80mm;
                                  max-width: 80mm;
                                  margin: 0 auto;
                                  background: white;
                                  color: #000;
                                  padding: 0;
                                }
                                
                                /* Tailwind Utility Classes */
                                .flex { display: flex !important; }
                                .flex-col { flex-direction: column !important; }
                                .items-center { align-items: center !important; }
                                .justify-between { justify-content: space-between !important; }
                                .gap-3 { gap: 3mm !important; }
                                .gap-4 { gap: 4mm !important; }
                                .mb-6 { margin-bottom: 4mm !important; }
                                .mb-4 { margin-bottom: 3mm !important; }
                                .mt-4 { margin-top: 3mm !important; }
                                .pb-3 { padding-bottom: 2mm !important; }
                                .pb-4 { padding-bottom: 3mm !important; }
                                .pt-2 { padding-top: 2mm !important; }
                                .border-b { border-bottom: 1px solid #d1d5db !important; }
                                .border-b-2 { border-bottom: 2px solid #9ca3af !important; }
                                .border-solid { border-style: solid !important; }
                                .border-dashed { border-style: dashed !important; }
                                .border-gray-200 { border-color: #d1d5db !important; }
                                .border-gray-300 { border-color: #d1d5db !important; }
                                .border-gray-400 { border-color: #9ca3af !important; }
                                .border-gray-700 { border-color: #374151 !important; }
                                .text-center { text-align: center !important; }
                                .text-right { text-align: right !important; }
                                .text-xs { font-size: 18px !important; }
                                .text-sm { font-size: 20px !important; }
                                .text-base { font-size: 22px !important; }
                                .text-3xl { font-size: 32px !important; }
                                .text-4xl { font-size: 40px !important; }
                                .text-[10px] { font-size: 16px !important; }
                                .font-bold { font-weight: bold !important; }
                                .font-semibold { font-weight: 600 !important; }
                                .font-medium { font-weight: 500 !important; }
                                .uppercase { text-transform: uppercase !important; }
                                .tracking-widest { letter-spacing: 0.15em !important; }
                                .tracking-wider { letter-spacing: 0.05em !important; }
                                .tracking-wide { letter-spacing: 0.025em !important; }
                                .italic { font-style: italic !important; }
                                .grid { display: grid !important; }
                                .grid-cols-2 { grid-template-columns: 1fr 1fr !important; }
                                .grid-cols-\[1fr_auto\] { grid-template-columns: 1fr auto !important; }
                                .space-y-4 > * + * { margin-top: 3mm !important; }
                                .space-y-1 > * + * { margin-top: 1mm !important; }
                                .items-start { align-items: flex-start !important; }
                                .text-gray-900 { color: #111827 !important; }
                                .text-gray-800 { color: #1f2937 !important; }
                                .text-gray-600 { color: #4b5563 !important; }
                                .text-gray-500 { color: #6b7280 !important; }
                                .text-gray-400 { color: #9ca3af !important; }
                                .text-white { color: #fff !important; }
                                .object-contain { object-fit: contain !important; }
                                .tabular-nums { font-variant-numeric: tabular-nums !important; }
                                .leading-tight { line-height: 1.25 !important; }
                                
                                /* Remove buttons */
                                button { display: none !important; }
                                
                                /* Print-specific styles */
                                img { max-width: 100%; height: auto; }
                                
                                #order-receipt {
                                  width: 100%;
                                  max-width: 80mm;
                                }
                              </style>
                            </head>
                            <body>
                              ${printContent.innerHTML}
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.focus();
                        setTimeout(() => {
                          printWindow.print();
                          printWindow.close();
                        }, 250);
                      }
                    }
                  }}
                />
              </div>
          </div>
        )}

        {/* info modal replaced by SweetAlert2 toasts */}
      </div>
      </>
    </ErrorBoundary>
  );
}

// Temporary error boundary to surface runtime/render errors on the Orders page
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // log to console for now
    console.error('Orders page error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-bold text-red-600">An error occurred rendering Orders</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{String(this.state.error && (this.state.error.stack || this.state.error.message))}</pre>
        </div>
      );
    }
    return this.props.children as React.ReactNode;
  }
}
