import React, { useEffect, useState, useMemo } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import api from "../../lib/axios";
import OrderDetailsModal from "../../components/modals/OrderDetailsModal";
import Button from "../../components/ui/button/Button";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table';

type OrderHistory = {
  id: number;
  order_alias?: string;
  transaction_number?: string;
  created_at: string;
  total_amount: number;
  order_items?: any[];
  orderItems?: any[];
  sale?: any;
  status?: string;
};

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

export default function OrderHistory() {
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<number | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [todayPage, setTodayPage] = useState(0);
  const todayItemsPerPage = 10;
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [overallStationFilter, setOverallStationFilter] = useState<string>('all');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/orders/completed');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        setOrders(data);
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || 'Failed to load completed orders');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Get unique stations for filter
  const stations = useMemo(() => {
    const uniqueStations = new Set<string>();
    orders.forEach(order => {
      const alias = order.order_alias || `#${order.id}`;
      if (alias === 'WI' || alias.startsWith('WI-')) {
        uniqueStations.add('walkin');
      } else if (alias.startsWith('PC-')) {
        uniqueStations.add(alias);
      }
    });
    return Array.from(uniqueStations).sort((a, b) => {
      if (a === 'walkin') return 1;
      if (b === 'walkin') return -1;
      const numA = parseInt(a.replace('PC-', ''));
      const numB = parseInt(b.replace('PC-', ''));
      return numA - numB;
    });
  }, [orders]);

  // Filter orders for today's business day
  const todayOrders = useMemo(() => {
    if (!orders || !Array.isArray(orders)) return [];
    return orders.filter(order => order?.created_at && isTodayOrder(order.created_at));
  }, [orders]);

  // Filter orders for the overall grid (with station filter + search)
  const filteredOverallOrders = useMemo(() => {
    let filtered = orders;

    // Apply station filter
    if (overallStationFilter !== 'all') {
      if (overallStationFilter === 'walkin') {
        filtered = filtered.filter(order => {
          const alias = order.order_alias || `#${order.id}`;
          return alias === 'WI' || alias.startsWith('WI-');
        });
      } else {
        filtered = filtered.filter(order => order.order_alias === overallStationFilter);
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => {
        const transactionNum = (order.transaction_number || '').toLowerCase();
        const alias = (order.order_alias || '').toLowerCase();
        const orderId = String(order.id);
        return transactionNum.includes(query) || alias.includes(query) || orderId.includes(query);
      });
    }

    return filtered;
  }, [orders, overallStationFilter, searchQuery]);

  // Column definitions
  const columns = useMemo<ColumnDef<OrderHistory>[]>(() => [
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
      cell: ({ row }) => `$${row.original.total_amount}`,
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => (row.original.order_items || row.original.orderItems || []).length,
    },
    // status column removed — status shown in modal instead
    {
      id: 'actions',
      header: 'Sale Summary',
      cell: ({ row }) => row.original.sale ? (
        <Button size="xs" onClick={() => {
          setViewOrderId(row.original.id);
          setViewOpen(true);
        }}>View</Button>
      ) : <span className="text-sm text-gray-500">—</span>,
    },
  ], []);

  // TanStack Table instance
  const table = useReactTable({
    data: filteredOverallOrders,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 6,
      },
    },
  });

  // Calculate today's revenue safely
  const todayRevenue = React.useMemo(() => {
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

  return (
    <>
      <PageMeta title="Orders" />
      <PageBreadcrumb pageTitle="Order History" />

      <div className="space-y-6">
        {/* Today's Orders Section */}
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">📅 Today's Orders (8am - 2am)</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Total: {todayOrders?.length || 0} order{todayOrders?.length !== 1 ? 's' : ''} • Revenue: ₱{todayRevenue}
            </p>
          </div>
          
          {loading ? (
            <div className="text-sm text-blue-600 dark:text-blue-400">Loading...</div>
          ) : todayOrders.length === 0 ? (
            <div className="text-sm text-blue-600 dark:text-blue-400">No orders yet for today's business day.</div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead className="bg-blue-100 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-blue-900 dark:text-blue-100">Station</th>
                      <th className="px-3 py-2 text-left font-semibold text-blue-900 dark:text-blue-100">Transaction #</th>
                      <th className="px-3 py-2 text-left font-semibold text-blue-900 dark:text-blue-100">Time</th>
                      <th className="px-3 py-2 text-right font-semibold text-blue-900 dark:text-blue-100">Amount</th>
                      {/* Status column removed — status shown in modal */}
                      <th className="px-3 py-2 text-center font-semibold text-blue-900 dark:text-blue-100">Actions</th>
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
                            <td className="px-3 py-2">
                              {isWalkIn ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-medium text-xs">
                                  🚶 Walk-In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md font-medium text-xs">
                                  🖥️ {alias}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {order.transaction_number || `#${order.id}`}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                              ₱{(() => {
                                let amount = typeof order.total_amount === 'number' ? order.total_amount : 0;
                                if (amount === 0 && (order.order_items || order.orderItems)) {
                                  const items = order.order_items || order.orderItems || [];
                                  amount = items.reduce((sum: number, item: any) => sum + (item.quantity || 0) * (item.price || 0), 0);
                                }
                                return amount.toFixed(2);
                              })()}
                            </td>
                            {/* Status moved to modal — no status cell in table */}
                            <td className="px-3 py-2 text-center">
                              {order.sale ? (
                                <Button size="xs" onClick={() => {
                                  setViewOrderId(order.id);
                                  setViewOpen(true);
                                }}>View</Button>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                
                {/* Pagination Controls */}
                {todayOrders.length > todayItemsPerPage && (
                  <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4">
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
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-semibold">All Completed Orders</h3>
            
            {/* Search and Station Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search by Transaction # or Station..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  table.setPageIndex(0);
                }}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <select
                value={overallStationFilter}
                onChange={(e) => {
                  setOverallStationFilter(e.target.value);
                  table.setPageIndex(0);
                }}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="all">All Orders ({orders.length})</option>
                {stations.map(station => {
                  if (station === 'walkin') {
                    const count = orders.filter(o => {
                      const alias = o.order_alias || `#${o.id}`;
                      return alias === 'WI' || alias.startsWith('WI-');
                    }).length;
                    return (
                      <option key="walkin" value="walkin">
                        🚶 Walk-In ({count})
                      </option>
                    );
                  }
                  const count = orders.filter(o => o.order_alias === station).length;
                  return (
                    <option key={station} value={station}>
                      {station} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {loading && (
            <div className="px-5 py-4">
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                      <div className="flex gap-2 mt-3">
                        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <div className="text-sm text-red-500">{error}</div>}

          {!loading && orders.length === 0 && !error && (
            <div className="text-sm text-gray-600">No completed orders found.</div>
          )}

          {!loading && orders.length > 0 && filteredOverallOrders.length === 0 && (
            <div className="text-sm text-gray-600">No orders found for the selected filter.</div>
          )}

          {filteredOverallOrders.length > 0 && (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100 dark:border-white/[0.05]">
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            className="px-5 py-4 sm:px-6 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center gap-2">
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
                    {table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        {row.getVisibleCells().map(cell => {
                          const isStatusCell = cell.column.id === 'status';
                          const isActionsCell = cell.column.id === 'actions';
                          return (
                            <td key={cell.id} className={`px-5 py-4 sm:px-6 text-sm text-gray-600 dark:text-gray-400 ${isStatusCell || isActionsCell ? 'text-center' : 'text-left'}`}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-gray-100 dark:border-white/[0.04] mt-3">
                  <div className="text-sm text-gray-600">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >Prev</button>
                    {Array.from({ length: table.getPageCount() }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => table.setPageIndex(idx)}
                        className={`px-3 py-1 rounded text-sm ${idx === table.getState().pagination.pageIndex ? 'bg-blue-500 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
                      >{idx + 1}</button>
                    ))}
                    <button
                      className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >Next</button>
                  </div>
                </div>
            </div>
          )}
        </div>
      </div>
      <OrderDetailsModal isOpen={viewOpen} onClose={() => setViewOpen(false)} orderId={viewOrderId} />
    </>
  );
}
