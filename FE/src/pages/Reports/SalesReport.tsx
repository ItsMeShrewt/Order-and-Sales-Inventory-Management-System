import { useEffect, useState } from 'react';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../../components/ui/table';
import api from '../../lib/axios';

interface OrderItem {
  id: number;
  price: number;
  quantity: number;
  product_id?: number;
  product?: {
    id: number;
    name?: string;
    product_name?: string;
  };
  product_name?: string;
  name?: string;
}

interface Order {
  id: number;
  created_at: string;
  order_date?: string;
  total_amount: number;
  order_items?: OrderItem[];
  status?: string;
  sale?: any; // sale relationship - if present, order is completed
}

// Helper function to get the business day date (resets at 8am, not midnight)
// Orders from midnight to 8am belong to the previous business day
const getBusinessDay = (dateStr: string): string => {
  const d = new Date(dateStr);
  const hour = d.getHours();
  
  // If hour is before 8am, this order belongs to the previous day's business day
  // Business day runs from 8am to 8am (or 8am to 2am next calendar day if you think of it that way)
  if (hour < 8) {
    d.setDate(d.getDate() - 1);
  }
  
  // Format as YYYY-MM-DD
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SalesReport() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filter state (simple date range)
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  // view mode: group by day / week / month / year
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('daily');
  // pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Annual view state
  const [annualData, setAnnualData] = useState<Array<{ month: number; total_amount: number; order_count: number }> | null>(null);
  
  // Modal state for product details
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPeriod, setModalPeriod] = useState<{ key: string; label: string } | null>(null);

  useEffect(() => {
    loadOrders();
    loadAnnualData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      // Add cache-busting timestamp to force fresh data
      const res = await api.get(`/orders?_t=${Date.now()}`);
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      // normalize into the shape we expect and ensure dates
      const normalized = data.map((o: any) => ({
        id: o.id,
        created_at: o.created_at || o.order_date || new Date().toISOString(),
        order_date: o.order_date || null,
        total_amount: typeof o.total_amount === 'number' ? o.total_amount : parseFloat(String(o.total_amount || 0)),
        order_items: o.order_items || o.orderItems || [],
        status: o.status || (o.sale ? 'Completed' : 'Pending')
      }));

      setOrders(normalized);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }

  }

  async function loadAnnualData() {
    try {
      const year = new Date().getFullYear();
      const res = await api.get(`/sales/monthly-details?year=${year}&_t=${Date.now()}`);
      if (res && res.data && Array.isArray(res.data.data)) {
        setAnnualData(res.data.data);
      }
    } catch (e: any) {
      console.error('Failed to load annual data:', e);
    }
  }

  const filtered = orders.filter((o: Order) => {
    if (!fromDate && !toDate) return true;
    // Use order_date if available, otherwise fall back to created_at
    const dateStr = o.order_date || o.created_at;
    const d = dateStr.split('T')[0]; // Extract YYYY-MM-DD
    
    // Debug logging
    if (fromDate || toDate) {
      console.log('[Filter] Order date:', d, '| From:', fromDate, '| To:', toDate);
    }
    
    // Only include if it's within the range (inclusive on both ends)
    if (fromDate && d < fromDate) {
      console.log('[Filter] Excluded:', d, '< fromDate', fromDate);
      return false;
    }
    if (toDate && d > toDate) {
      console.log('[Filter] Excluded:', d, '> toDate', toDate);
      return false;
    }
    
    console.log('[Filter] Included:', d);
    return true;
  });

  // aggregated values are computed during export/grouping as needed

  const isCompleted = (o: Order) => !!o.sale || String(o.status || '').toLowerCase() === 'completed';


  async function htmlToPdfAndDownload(html: string, filename: string) {
    // create container, render HTML and pass to html2pdf
    const container = document.createElement('div');
    container.style.padding = '12px';
    container.style.background = '#fff';
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      // dynamic import to avoid static type issues and reduce initial bundle cost
      const mod = await import('html2pdf.js');
      const html2pdf = (mod as any).default || mod;
      await html2pdf()
        .from(container)
        .set({
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();
    } finally {
      // cleanup
      document.body.removeChild(container);
    }
  }


  async function exportPdfForPeriod(periodKey: string) {
    // For daily view, periodKey is YYYY-MM-DD; export COMPLETED orders for that business day as a PDF
    const dayOrders = filtered.filter((o) => {
      if (!isCompleted(o)) return false;
      const dateStr = o.order_date || o.created_at;
      return getBusinessDay(dateStr) === periodKey;
    });
    const rowsHtml = dayOrders.map((o) => {
      // Show only date (DD/MM/YYYY) without time
      const dateStr = o.order_date || o.created_at;
      const [year, month, day] = dateStr.split('T')[0].split('-');
      const formattedDate = `${day}/${month}/${year}`;
      return `
      <tr>
        <td style="padding:10px 14px;border:1px solid #ddd;">#${o.id}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;">${formattedDate}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">${(o.order_items || []).reduce((s, i) => s + (i.quantity || 0), 0)}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">&#8369;${(o.total_amount || 0).toFixed(2)}</td>
      </tr>`;
    }).join('\n');

    const total = dayOrders.reduce((acc, o) => acc + (o.total_amount || 0), 0);

    const dateRangeText = fromDate || toDate ? `(${fromDate || 'All'} to ${toDate || 'Today'})` : '';
    const title = `Sales Report - ${periodKey} ${dateRangeText}`;
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>html,body{box-sizing:border-box;height:100%;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:18px}.report-wrapper{padding:10px;background:#fff;margin-top:48px}.report-header{margin-bottom:28px}table{border-collapse:collapse;width:calc(100% - 10px);margin:0 5px;table-layout:auto;border-spacing:0}th,td{padding:10px 14px;border:1px solid #ddd;vertical-align:middle;word-break:break-word}th{background:#f3f4f6;font-weight:700}thead th{text-align:left}tfoot td{font-weight:700}</style></head><body><div class="report-wrapper"><div class="report-header"><h2>${title}</h2><div>Generated: ${new Date().toLocaleString()}</div></div><table><thead><tr><th>Order #</th><th>Date</th><th style="text-align:right;">Items</th><th style="text-align:right;">Total (&#8369;)</th></tr></thead><tbody>${rowsHtml}<tr><td style="font-weight:700;padding:10px 14px;border:1px solid #ddd;">Totals</td><td style="padding:10px 14px;border:1px solid #ddd;"></td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">${dayOrders.reduce((acc,o)=> acc + (o.order_items || []).reduce((s,i)=>s + (i.quantity||0),0),0)}</td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">&#8369;${total.toFixed(2)}</td></tr></tbody></table></div></body></html>`;

    await htmlToPdfAndDownload(html, `sales-report-${periodKey}.pdf`);
  }

  function exportCsvForPeriod(periodKey: string) {
    // Special handling for annual view - export all months from backend data
    if (viewMode === 'annual' && annualData) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
      const year = new Date().getFullYear();
      
      const headers = ['Month', 'Orders', 'Total'];
      const rows = annualData.map((m) => [
        monthNames[m.month - 1],
        String(m.order_count),
        Number(m.total_amount).toFixed(2),
      ]);
      
      // Add totals row
      const totalsOrders = annualData.reduce((sum, m) => sum + m.order_count, 0);
      const totalsAmount = annualData.reduce((sum, m) => sum + m.total_amount, 0);
      
      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
        `"Totals","${totalsOrders}","${totalsAmount.toFixed(2)}"`
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sales-annual-${year}.csv`;
      a.click();
      return;
    }

    // returns CSV of orders that belong to the specified periodKey (weekly/monthly/annual)
    const periodOrders = filtered.filter((o) => {
      if (!isCompleted(o)) return false; // only export completed orders for period
      
      // Use order_date if available, otherwise fall back to created_at
      const dateStr = o.order_date || o.created_at;
      
      if (viewMode === 'weekly') {
        // Parse date string as YYYY-MM-DD
        const parts = dateStr.split('T')[0].split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const dt = new Date(year, month, day);
        const dayOfWeek = dt.getDay();
        const diff = ((dayOfWeek + 6) % 7);
        dt.setDate(dt.getDate() - diff);
        // Format the date back as YYYY-MM-DD without timezone conversion
        const weekStart = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        return weekStart === periodKey;
      }
      if (viewMode === 'monthly') {
        const parts = dateStr.split('T')[0].split('-');
        return `${parts[0]}-${parts[1]}` === periodKey;
      }
      // fallback (daily) - use business day
      return getBusinessDay(dateStr) === periodKey;
    });

    // If annual view, export a monthly breakdown CSV for the selected year
    if (viewMode === 'annual') {
      const months: Record<string, { orders: number; items: number; total: number; label?: string }> = {};
      periodOrders.forEach((o) => {
        const d = new Date(o.created_at);
        const key = d.toISOString().slice(0, 7); // YYYY-MM
        const label = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
        months[key] = months[key] || { orders: 0, items: 0, total: 0, label };
        months[key].orders += 1;
        months[key].items += (o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0);
        months[key].total += o.total_amount || 0;
      });

      const headers = ['Month', 'Orders', 'Items', 'Total'];
      const rows = Object.keys(months).sort().map(k => [months[k].label ?? k, String(months[k].orders), String(months[k].items), Number(months[k].total).toFixed(2)]);
      const grand = rows.reduce((acc, r) => { acc.orders += Number(r[1]); acc.items += Number(r[2]); acc.total += Number(r[3]); return acc; }, { orders: 0, items: 0, total: 0 });
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')), `"Totals","${grand.orders}","${grand.items}","${grand.total.toFixed(2)}"`].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sales-period-${viewMode}-${periodKey}.csv`;
      a.click();
      return;
    }

    const headers = ['Order ID', 'Date', 'Items', 'Total'];
    const rows = periodOrders.map((o) => [
      String(o.id),
      new Date(o.order_date || o.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
      String((o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0)),
      Number(o.total_amount || 0).toFixed(2),
    ]);
    
    // Add totals row
    const totalItems = periodOrders.reduce((acc, o) => acc + (o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0), 0);
    const totalAmount = periodOrders.reduce((acc, o) => acc + (o.total_amount || 0), 0);
    
    const csv = [
      headers.join(','), 
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      `"Totals","","${totalItems}","${totalAmount.toFixed(2)}"`
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-period-${viewMode}-${periodKey}.csv`;
    a.click();
  }

  async function exportFilteredDateRangeCsv() {
    // Export all filtered orders (respecting date range) as CSV
    const completedFiltered = filtered.filter((o) => isCompleted(o));
    
    if (completedFiltered.length === 0) {
      alert('No orders to export in this date range');
      return;
    }

    const headers = ['Order ID', 'Date', 'Items', 'Total (₱)'];
    const rows = completedFiltered.map((o) => [
      String(o.id),
      new Date(o.order_date || o.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
      String((o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0)),
      Number(o.total_amount || 0).toFixed(2),
    ]);

    // Add totals row
    const totalItems = completedFiltered.reduce((acc, o) => acc + (o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0), 0);
    const totalAmount = completedFiltered.reduce((acc, o) => acc + (o.total_amount || 0), 0);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      `"Totals","","${totalItems}","${totalAmount.toFixed(2)}"`
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const dateRangeText = fromDate && toDate ? `${fromDate}_to_${toDate}` : 'all';
    a.download = `sales-report-${dateRangeText}.csv`;
    a.click();
  }

  async function exportFilteredDateRangePdf() {
    // Export all filtered orders (respecting date range) as PDF
    const completedFiltered = filtered.filter((o) => isCompleted(o));
    
    if (completedFiltered.length === 0) {
      alert('No orders to export in this date range');
      return;
    }

    const rowsHtml = completedFiltered.map((o) => `
      <tr>
        <td style="padding:10px 14px;border:1px solid #ddd;">#${o.id}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;">${new Date(o.order_date || o.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">${(o.order_items || []).reduce((s, i) => s + (i.quantity || 0), 0)}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">&#8369;${(o.total_amount || 0).toFixed(2)}</td>
      </tr>`).join('\n');

    const totalItems = completedFiltered.reduce((acc, o) => acc + (o.order_items || []).reduce((s, i) => s + (i.quantity || 0), 0), 0);
    const totalAmount = completedFiltered.reduce((acc, o) => acc + (o.total_amount || 0), 0);

    const dateRangeText = fromDate && toDate ? `${fromDate} to ${toDate}` : 'All Dates';
    const title = `Sales Report - ${dateRangeText}`;
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>html,body{box-sizing:border-box;height:100%;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:18px}.report-wrapper{padding:10px;background:#fff;margin-top:48px}.report-header{margin-bottom:28px}table{border-collapse:collapse;width:calc(100% - 10px);margin:0 5px;table-layout:auto;border-spacing:0}th,td{padding:10px 14px;border:1px solid #ddd;vertical-align:middle;word-break:break-word}th{background:#f3f4f6;font-weight:700}thead th{text-align:left}tfoot td{font-weight:700}</style></head><body><div class="report-wrapper"><div class="report-header"><h2>${title}</h2><div>Generated: ${new Date().toLocaleString()}</div></div><table><thead><tr><th>Order #</th><th>Date</th><th style="text-align:right;">Items</th><th style="text-align:right;">Total (&#8369;)</th></tr></thead><tbody>${rowsHtml}<tr><td style="font-weight:700;padding:10px 14px;border:1px solid #ddd;">Totals</td><td style="padding:10px 14px;border:1px solid #ddd;"></td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">${totalItems}</td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">&#8369;${totalAmount.toFixed(2)}</td></tr></tbody></table></div></body></html>`;

    await htmlToPdfAndDownload(html, `sales-report-${fromDate || 'all'}-to-${toDate || 'today'}.pdf`);
  }

  async function exportPdfForAnnual() {
    if (!annualData) return;
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const year = new Date().getFullYear();
    
    const rowsHtml = annualData.map((m) => `
      <tr>
        <td style="padding:10px 14px;border:1px solid #ddd;">${monthNames[m.month - 1]}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">${m.order_count}</td>
        <td style="padding:10px 14px;border:1px solid #ddd;text-align:right;">&#8369;${Number(m.total_amount).toFixed(2)}</td>
      </tr>`).join('\n');

    const totalOrders = annualData.reduce((sum, m) => sum + m.order_count, 0);
    const totalAmount = annualData.reduce((sum, m) => sum + m.total_amount, 0);

    const title = `Annual Sales Report - ${year}`;
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>html,body{box-sizing:border-box;height:100%;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:18px}.report-wrapper{padding:10px;background:#fff;margin-top:48px}.report-header{margin-bottom:28px}table{border-collapse:collapse;width:calc(100% - 10px);margin:0 5px;table-layout:auto;border-spacing:0}th,td{padding:10px 14px;border:1px solid #ddd;vertical-align:middle;word-break:break-word}th{background:#f3f4f6;font-weight:700}thead th{text-align:left}tfoot td{font-weight:700}</style></head><body><div class="report-wrapper"><div class="report-header"><h2>${title}</h2><div>Generated: ${new Date().toLocaleString()}</div></div><table><thead><tr><th>Month</th><th style="text-align:right;">Orders</th><th style="text-align:right;">Total (&#8369;)</th></tr></thead><tbody>${rowsHtml}<tr><td style="font-weight:700;padding:10px 14px;border:1px solid #ddd;">Totals</td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">${totalOrders}</td><td style="padding:10px 14px;border:1px solid #ddd;text-align:right;font-weight:700;">&#8369;${totalAmount.toFixed(2)}</td></tr></tbody></table></div></body></html>`;

    await htmlToPdfAndDownload(html, `sales-annual-${year}.pdf`);
  }

  // grouped rows for the current view mode (daily/weekly/monthly/annual)
  const groupedByPeriod: { key: string; label: string; orders: number; items: number; total: number }[] = [];
  {
    // Special handling for annual view - show single year row (respecting date filters)
    if (viewMode === 'annual' && annualData) {
      // For annual view, if date filters are set, only count filtered orders instead of using annualData totals
      if (fromDate || toDate) {
        const totalOrders = filtered.filter((o) => isCompleted(o)).length;
        const totalAmount = filtered.filter((o) => isCompleted(o)).reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const totalItems = filtered.filter((o) => isCompleted(o)).reduce((sum, o) => sum + (o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0), 0);
        
        groupedByPeriod.push({
          key: String(new Date().getFullYear()),
          label: `Year ${new Date().getFullYear()} (Filtered)`,
          orders: totalOrders,
          items: totalItems,
          total: totalAmount,
        });
      } else {
        // No date filter - use backend annual data
        const totalOrders = annualData.reduce((sum, m) => sum + m.order_count, 0);
        const totalAmount = annualData.reduce((sum, m) => sum + m.total_amount, 0);
        // Count items only from completed orders (those with sales)
        const totalItems = filtered.filter((o) => isCompleted(o)).reduce((sum, o) => sum + (o.order_items || []).reduce((c: number, it: OrderItem) => c + (it.quantity || 0), 0), 0);
        
        groupedByPeriod.push({
          key: String(new Date().getFullYear()),
          label: `Year ${new Date().getFullYear()}`,
          orders: totalOrders,
          items: totalItems,
          total: totalAmount,
        });
      }
    } else {
      // Regular grouping for daily/weekly/monthly views
      const grouped: Record<string, { orders: number; items: number; total: number; label?: string }> = {};
      filtered.forEach((o: Order) => {
        if (!isCompleted(o)) return; // ignore non-completed orders for UI grouping consistency
        // Use order_date if available, otherwise fall back to created_at
        const dateStr = o.order_date || o.created_at;
        const d = new Date(dateStr);
        let key = '';
        let label = '';

        if (viewMode === 'daily') {
          key = getBusinessDay(dateStr);
          // Format as DD/MM/YYYY for display (day name shown in separate column)
          const [year, month, day] = key.split('-');
          label = `${day}/${month}/${year}`;
          // Debug log
          console.log(`[Daily Grouping] Order ${o.id}: dateStr=${dateStr}, businessDay=${key}, label=${label}`);
        } else if (viewMode === 'weekly') {
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
          const weekStart = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          key = weekStart;
          label = `Week of ${weekStart}`;
        } else if (viewMode === 'monthly') {
          const parts = dateStr.split('T')[0].split('-');
          key = `${parts[0]}-${parts[1]}`;
          label = key;
        } else {
          // annual: group by month
          const month = d.getMonth() + 1;
          key = String(month);
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                             'July', 'August', 'September', 'October', 'November', 'December'];
          label = monthNames[month - 1];
        }

        grouped[key] = grouped[key] || { orders: 0, items: 0, total: 0, label };
        grouped[key].orders += 1;
        grouped[key].items += (o.order_items || []).reduce((s: number, i: OrderItem) => s + (i.quantity || 0), 0);
        grouped[key].total += o.total_amount || 0;
      });

      Object.keys(grouped)
        .sort((a, b) => {
          // For daily view, sort in descending order (latest first)
          if (viewMode === 'daily') {
            return b.localeCompare(a); // Descending: latest date first
          }
          // For other views, sort in ascending order (oldest first)
          return a.localeCompare(b); // Ascending: oldest first
        })
        .forEach((k) => groupedByPeriod.push({ key: k, label: grouped[k].label || k, orders: grouped[k].orders, items: grouped[k].items, total: grouped[k].total }));
    }
  }


  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <PageMeta title="Sales Report" />
      <div className="mb-6">
        <PageBreadcrumb pageTitle="Sales Reports"
        breadcrumbLabel="Sales Reports" />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <div className="flex flex-col gap-2 mb-6">
          {/* Date Range Filter */}
          {loading ? (
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="flex-1 max-w-xs">
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate || ''}
                  onChange={(e) => {
                    setFromDate(e.target.value || null);
                    console.log('From date set to:', e.target.value);
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate || ''}
                  onChange={(e) => {
                    setToDate(e.target.value || null);
                    console.log('To date set to:', e.target.value);
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                onClick={() => { setFromDate(null); setToDate(null); setCurrentPage(1); }}
                className="px-3 py-1 text-sm bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          {(fromDate || toDate) && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                📅 Filtered: {fromDate} to {toDate} • {filtered.length > 0 ? `${filtered.length} order(s) found` : 'No orders in this range'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportFilteredDateRangeCsv()}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 font-medium transition-colors"
                >
                  📥 Export CSV
                </button>
                <button
                  onClick={() => exportFilteredDateRangePdf()}
                  className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 font-medium transition-colors"
                >
                  📄 Export PDF
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-6 mb-6">
          {loading ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-5 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-10 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="h-10 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="h-10 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="h-10 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                </div>
              </div>
              <div className="h-10 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setViewMode('daily'); setCurrentPage(1); }} 
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === 'daily' 
                        ? 'bg-brand-600 text-white shadow-md' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Daily
                  </button>
                  <button 
                    onClick={() => { setViewMode('weekly'); setCurrentPage(1); }} 
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === 'weekly' 
                        ? 'bg-brand-600 text-white shadow-md' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Weekly
                  </button>
                  <button 
                    onClick={() => { setViewMode('monthly'); setCurrentPage(1); }} 
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === 'monthly' 
                        ? 'bg-brand-600 text-white shadow-md' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Monthly
                  </button>
                  <button 
                    onClick={() => { setViewMode('annual'); setCurrentPage(1); }} 
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === 'annual' 
                        ? 'bg-brand-600 text-white shadow-md' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Annual
                  </button>
                </div>
              </div>
              <button 
                onClick={() => { loadOrders(); loadAnnualData(); }} 
                disabled={loading}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          )}
        </div>

        {loading && (
          <div className="overflow-x-auto">
            <div className="min-w-[600px] space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  </div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <div className="py-6 text-center text-red-600">{error}</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  {viewMode === 'daily' && <TableCell isHeader className="py-3 px-3 text-left">Day</TableCell>}
                  <TableCell isHeader className="py-3 px-3 text-left">Period</TableCell>
                  <TableCell isHeader className="py-3 px-3 text-right">Orders</TableCell>
                  <TableCell isHeader className="py-3 px-3 text-right">Items</TableCell>
                  <TableCell isHeader className="py-3 px-3 text-right">Total (₱)</TableCell>
                  <TableCell isHeader className="py-3 px-3 text-center">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByPeriod.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((g) => {
                  let dayName = '';
                  if (viewMode === 'daily') {
                    const [year, month, day] = g.key.split('-');
                    dayName = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleString('en-US', { weekday: 'long' });
                  }

                  return (
                    <TableRow key={g.key} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      {viewMode === 'daily' && <TableCell className="py-3 px-3 font-medium text-gray-700 dark:text-gray-300">{dayName}</TableCell>}
                      <TableCell className="py-3 px-3">{g.label}</TableCell>
                      <TableCell className="py-3 px-3 text-right">{g.orders}</TableCell>
                      <TableCell className="py-3 px-3 text-right">{g.items}</TableCell>
                      <TableCell className="py-3 px-3 text-right">₱{g.total.toFixed(2)}</TableCell>
                      <TableCell className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {viewMode === 'daily' ? (
                            <button
                              onClick={() => exportPdfForPeriod(g.key)}
                              className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              PDF
                            </button>
                          ) : viewMode === 'annual' ? (
                            <button
                              onClick={() => exportPdfForAnnual()}
                              className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                            >
                              Export
                            </button>
                          ) : (
                            <button
                              onClick={() => exportCsvForPeriod(g.key)}
                              className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              CSV
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setModalPeriod({ key: g.key, label: g.label });
                              setModalOpen(true);
                            }}
                            className="px-3 py-1 bg-brand-600 text-white rounded text-sm hover:bg-brand-700 transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}              </TableBody>
            </Table>
            
            {/* Pagination controls */}
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 dark:border-white/[0.04]">
              <div className="text-sm text-gray-600">Page {currentPage} of {Math.max(1, Math.ceil(groupedByPeriod.length / itemsPerPage))}</div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >Prev</button>
                {Array.from({ length: Math.max(1, Math.ceil(groupedByPeriod.length / itemsPerPage)) }).map((_, idx) => {
                  const page = idx + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded text-sm ${page === currentPage ? 'bg-blue-500 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
                    >{page}</button>
                  );
                })}
                <button
                  className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage >= Math.max(1, Math.ceil(groupedByPeriod.length / itemsPerPage))}
                >Next</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Details Modal */}
      {modalOpen && modalPeriod && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-brand-50 to-white dark:from-gray-800 dark:to-gray-900">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Products Sold</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">{modalPeriod.label}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-all duration-200"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {(() => {
                // Get all orders for this period
                const periodOrders = filtered.filter((o) => {
                  if (!isCompleted(o)) return false;
                  const dateStr = o.order_date || o.created_at;
                  
                  if (viewMode === 'daily') {
                    return getBusinessDay(dateStr) === modalPeriod.key;
                  } else if (viewMode === 'weekly') {
                    const parts = dateStr.split('T')[0].split('-');
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    const day = parseInt(parts[2]);
                    const dt = new Date(year, month, day);
                    const dayOfWeek = dt.getDay();
                    const diff = ((dayOfWeek + 6) % 7);
                    dt.setDate(dt.getDate() - diff);
                    const weekStart = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    return weekStart === modalPeriod.key;
                  } else if (viewMode === 'monthly') {
                    const parts = dateStr.split('T')[0].split('-');
                    return `${parts[0]}-${parts[1]}` === modalPeriod.key;
                  }
                  return false;
                });

                // Aggregate products sold in this period
                const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
                periodOrders.forEach((order) => {
                  (order.order_items || []).forEach((item) => {
                    // Try multiple ways to get the product name
                    const productName = item.product?.product_name || item.product?.name || item.product_name || item.name || `Product #${item.product_id || item.id}`;
                    const key = productName;
                    if (!productSales[key]) {
                      productSales[key] = { name: productName, quantity: 0, revenue: 0 };
                    }
                    productSales[key].quantity += item.quantity || 0;
                    productSales[key].revenue += (item.price || 0) * (item.quantity || 0);
                  });
                });
                
                const sortedProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity);
                
                return sortedProducts.length > 0 ? (
                  <div className="overflow-x-auto -mx-6">
                    <div className="inline-block min-w-full align-middle px-6">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
                          <tr>
                            <th className="py-4 px-6 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Product Name</th>
                            <th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Quantity Sold</th>
                            <th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">{sortedProducts.map((product, idx) => (
                            <tr key={idx} className="hover:bg-brand-50 dark:hover:bg-gray-800/80 transition-colors duration-150">
                              <td className="py-4 px-6 text-sm font-medium text-gray-900 dark:text-gray-100">{product.name}</td>
                              <td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300 font-semibold">{product.quantity}</td>
                              <td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300 font-semibold">₱{product.revenue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gradient-to-r from-brand-100 to-brand-50 dark:from-gray-700 dark:to-gray-800 border-t-2 border-brand-400 dark:border-gray-600">
                          <tr>
                            <td className="py-4 px-6 text-sm font-bold text-gray-900 dark:text-white uppercase">Total</td>
                            <td className="py-4 px-6 text-sm text-right font-bold text-brand-700 dark:text-brand-400">
                              {sortedProducts.reduce((sum, p) => sum + p.quantity, 0)} items
                            </td>
                            <td className="py-4 px-6 text-sm text-right font-bold text-brand-700 dark:text-brand-400">
                              ₱{sortedProducts.reduce((sum, p) => sum + p.revenue, 0).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">No Products Sold</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">There were no products sold during this period</p>
                  </div>
                );
              })()}
            </div>


          </div>
        </div>
      )}
    </div>
  );
}
