import { useEffect, useState } from 'react';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import ComponentCard from '../../components/common/ComponentCard';
import api from '../../lib/axios';
import AlertIcon from '../../icons/alert.svg';

interface Damage {
  id: number;
  product_id: number;
  product?: {
    id: number;
    product_name?: string;
    name?: string;
    price?: number;
  };
  quantity: number;
  cost_per_unit: number;
  reason?: string;
  action_taken?: string;
  notes?: string;
  created_at: string;
}

interface DamageReport {
  total_damages_recorded: number;
  total_damage_cost: number;
  damages_by_product: Array<{
    product_id: number;
    product_name: string;
    total_damaged_quantity: number;
    total_damage_cost: number;
    records_count: number;
    product_price?: number;
  }>;
}

interface ActionStats {
  write_off: number;
  return_to_supplier: number;
}

export default function DamageReport() {
  const [damages, setDamages] = useState<Damage[]>([]);
  const [reportSummary, setReportSummary] = useState<DamageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadDamageData();
  }, []);

  async function loadDamageData() {
    setLoading(true);
    setError(null);
    try {
      const [damagesRes, summaryRes] = await Promise.all([
        api.get(`/damages?_t=${Date.now()}`),
        api.get(`/damages/report/summary?_t=${Date.now()}`)
      ]);

      const damagesData = Array.isArray(damagesRes.data) ? damagesRes.data : damagesRes.data.data || [];
      setDamages(damagesData);
      setReportSummary(summaryRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load damage reports');
    } finally {
      setLoading(false);
    }
  }

  const getActionLabel = (action?: string) => {
    switch(action) {
      case 'write_off':
        return 'Write-Off (Salary Deduction)';
      case 'return_to_supplier':
        return 'Return to Supplier';
      default:
        return 'Write-Off (Salary Deduction)';
    }
  };

  const getActionBadgeColor = (action?: string) => {
    switch(action) {
      case 'write_off':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'return_to_supplier':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const calculateActionStats = () => {
    const stats: ActionStats = { write_off: 0, return_to_supplier: 0 };
    damages.forEach(dmg => {
      const action = (dmg.action_taken || 'write_off') as keyof ActionStats;
      if (action in stats) stats[action]++;
    });
    return stats;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const downloadCSV = () => {
    if (!reportSummary) return;
    
    const headers = ['Product Name', 'Units Damaged', 'Price per Unit', 'Total Cost', 'Incidents'];
    const rows = reportSummary.damages_by_product.map(item => [
      `"${item.product_name}"`,
      item.total_damaged_quantity,
      (item.total_damage_cost / item.total_damaged_quantity).toFixed(2),
      item.total_damage_cost.toFixed(2),
      item.records_count
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `damage-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const actionStats = calculateActionStats();
  const totalPage = Math.ceil((reportSummary?.damages_by_product.length || 0) / pageSize);
  const paginatedData = reportSummary?.damages_by_product.slice(currentPage * pageSize, (currentPage + 1) * pageSize) || [];

  return (
    <div className="space-y-6">
      <PageMeta title="Damage Report" />
      <PageBreadcrumb 
        pageTitle="Damage Report" 
        breadcrumbIcon={<img src={AlertIcon} alt="Damage" className="w-5 h-5" />}
      />

      <ComponentCard
        title="Damage Report Summary"
      >
        <div className="space-y-6">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
              {error}
            </div>
          )}

          {/* Summary Cards */}
          {!loading && reportSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Total Incidents */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-900/10 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase">Total Incidents</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">{reportSummary.total_damages_recorded}</p>
              </div>

              {/* Total Units */}
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-900/10 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 uppercase">Units Damaged</p>
                <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-2">
                  {reportSummary.damages_by_product.reduce((sum, p) => sum + p.total_damaged_quantity, 0)}
                </p>
              </div>

              {/* Total Cost */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-900/10 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 uppercase">Total Cost</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100 mt-2">
                  ₱{reportSummary.total_damage_cost.toFixed(2)}
                </p>
              </div>

              {/* Write-Off Count */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-900/10 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400 uppercase">Write-offs</p>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-2">{actionStats.write_off}</p>
              </div>

              {/* Return to Supplier Count */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-900/10 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400 uppercase">Returns</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-2">{actionStats.return_to_supplier}</p>
              </div>
            </div>
          )}

          {/* Summary Table */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">{error}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-700 dark:text-gray-300">
                  <thead className="text-xs font-semibold text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left">Product Name</th>
                      <th className="px-6 py-4 text-center">Units Damaged</th>
                      <th className="px-6 py-4 text-center">Price per Unit</th>
                      <th className="px-6 py-4 text-center">Total Cost</th>
                      <th className="px-6 py-4 text-center">Incidents</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {reportSummary && reportSummary.damages_by_product.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          No damage records found
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((item) => (
                        <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              {item.total_damaged_quantity} units
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-700 dark:text-gray-300">
                            ₱{(item.total_damage_cost / item.total_damaged_quantity).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-red-600 dark:text-red-400">
                            ₱{item.total_damage_cost.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center text-gray-700 dark:text-gray-300">{item.records_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {reportSummary && reportSummary.damages_by_product.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, reportSummary.damages_by_product.length)} of {reportSummary.damages_by_product.length}
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(0);
                      }}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      <option value={5}>5 per page</option>
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(0)}
                      disabled={currentPage === 0}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                      Page {currentPage + 1} of {totalPage}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPage - 1, p + 1))}
                      disabled={currentPage >= totalPage - 1}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPage - 1)}
                      disabled={currentPage >= totalPage - 1}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detailed Incidents View */}
          {!loading && damages.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">All Damage Incidents</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-700 dark:text-gray-300">
                    <thead className="text-xs font-semibold text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-6 py-4 text-left">Product</th>
                        <th className="px-6 py-4 text-center">Quantity</th>
                        <th className="px-6 py-4 text-left">Reason</th>
                        <th className="px-6 py-4 text-center">Date</th>
                        <th className="px-6 py-4 text-center">Action</th>
                        <th className="px-6 py-4 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {damages.map((damage) => (
                        <tr key={damage.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                            {damage.product?.product_name || damage.product?.name || `Product #${damage.product_id}`}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              {damage.quantity}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{damage.reason || '-'}</td>
                          <td className="px-6 py-4 text-center text-gray-700 dark:text-gray-300">
                            {formatDate(damage.created_at)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getActionBadgeColor(damage.action_taken)}`}>
                              {getActionLabel(damage.action_taken).split('(')[0].trim()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-red-600 dark:text-red-400">
                            ₱{(damage.cost_per_unit * damage.quantity).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Download CSV Button at the End */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={downloadCSV}
            disabled={!reportSummary || reportSummary.damages_by_product.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            📥 Download CSV
          </button>
        </div>
      </ComponentCard>
    </div>
  );
}
