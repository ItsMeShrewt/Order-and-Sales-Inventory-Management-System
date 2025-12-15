import { useEffect, useMemo, useState } from 'react';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import ComponentCard from '../../components/common/ComponentCard';
import api from '../../lib/axios';

interface Product {
	id: number;
	product_name?: string;
	name?: string;
	sku?: string;
	price?: number;
	unit_price?: number;
	category?: string;
}

interface InventoryRow {
	id?: number;
	product_id: number;
	quantity: number;
	created_at?: string;
	type?: string;
	source?: string;
}

interface PeriodDetail {
	key: string;
	label: string;
	totalQty: number;
	products: Record<number, { 
		name: string; 
		oldQty: number;
		newQty: number;
		totalQty: number;
		price: number;
		totalValue: number;
	}>;
}

export default function InventoryReport() {
	const [tab, setTab] = useState<'today' | 'historical'>('today');
	const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('daily');
	const [fromDate, setFromDate] = useState<string | null>(null);
	const [toDate, setToDate] = useState<string | null>(null);
	const [selectedPeriod, setSelectedPeriod] = useState<PeriodDetail | null>(null);
	const [showModal, setShowModal] = useState(false);
	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(10);
	const [historicalPage, setHistoricalPage] = useState(0);
	const [historicalPageSize, setHistoricalPageSize] = useState(10);

	const [products, setProducts] = useState<Product[]>([]);
	const [inventories, setInventories] = useState<InventoryRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const [pRes, iRes] = await Promise.all([
					api.get('/products'),
					api.get('/inventories')
				]);
				const pData = Array.isArray(pRes.data) ? pRes.data : pRes.data.data || [];
				const iData = Array.isArray(iRes.data) ? iRes.data : iRes.data.data || [];
				if (!mounted) return;
				setProducts(pData);
				setInventories(iData.map((r: any) => ({ 
					id: r.id, 
					product_id: Number(r.product_id ?? r.product?.id ?? r.productId ?? 0), 
					quantity: Number(r.quantity ?? r.qty ?? r.amount ?? 0),
					created_at: r.created_at || r.date || new Date().toISOString(),
					type: r.type || r.transaction_type || '',
					source: r.source || ''
				})));
			} catch (e: any) {
				if (!mounted) return;
				setError(e?.response?.data?.message || e.message || 'Failed to load inventory');
			} finally {
				if (!mounted) return;
				setLoading(false);
			}
		};
		load();
		const refreshHandler = () => { if (mounted) load(); };
		window.addEventListener('products:refresh', refreshHandler as EventListener);
		return () => { mounted = false; window.removeEventListener('products:refresh', refreshHandler as EventListener); };
	}, []);

	// Calculate old vs new stock for each product in a specific period
	const getProductStockChange = (pid: number, periodKey: string) => {
		// Get all inventory records for this product (excluding 0 quantities), sorted by date ascending
		const prodInvs = inventories
			.filter(inv => inv.product_id === pid && inv.quantity > 0)
			.sort((a, b) => {
				const dateA = new Date(a.created_at || '').getTime();
				const dateB = new Date(b.created_at || '').getTime();
				return dateA - dateB;
			});

		if (prodInvs.length === 0) return { oldQty: 0, newQty: 0 };

		let oldQty = 0;  // Total stock from BEFORE this period
		let newQty = 0;  // Total stock added IN this period
		let periodStartDate: Date;
		let periodEndDate: Date;

		// Parse period key to get start and end dates based on view mode
		if (viewMode === 'daily') {
			periodStartDate = new Date(periodKey);
			periodEndDate = new Date(periodKey);
			periodEndDate.setHours(23, 59, 59, 999);
		} else if (viewMode === 'weekly') {
			// periodKey is the week start date (YYYY-MM-DD)
			periodStartDate = new Date(periodKey);
			periodEndDate = new Date(periodKey);
			periodEndDate.setDate(periodEndDate.getDate() + 6);
			periodEndDate.setHours(23, 59, 59, 999);
		} else if (viewMode === 'monthly') {
			// periodKey is YYYY-MM
			const parts = periodKey.split('-');
			const year = parseInt(parts[0]);
			const month = parseInt(parts[1]) - 1;
			periodStartDate = new Date(year, month, 1);
			periodEndDate = new Date(year, month + 1, 0);
			periodEndDate.setHours(23, 59, 59, 999);
		} else { // annual
			// periodKey is YYYY
			const year = parseInt(periodKey);
			periodStartDate = new Date(year, 0, 1);
			periodEndDate = new Date(year, 11, 31);
			periodEndDate.setHours(23, 59, 59, 999);
		}

		// Old Stock = Sum of all quantities BEFORE this period (excluding cancellations)
		// For annual view, old stock is always 0 (we don't look at pre-year inventory)
		if (viewMode !== 'annual') {
			for (const inv of prodInvs) {
				const invDate = new Date(inv.created_at || '');
				const isCancellation = inv.type === 'return' || inv.type === 'cancellation' || 
									   inv.source === 'cancellation' || inv.source === 'order_cancelled';
				
				if (invDate < periodStartDate && !isCancellation) {
					oldQty += inv.quantity;
				}
			}
		}

		// New Stock = Sum of all quantities IN this period (excluding cancellations - they're returns, not new)
		for (const inv of prodInvs) {
			const invDate = new Date(inv.created_at || '');
			const isCancellation = inv.type === 'return' || inv.type === 'cancellation' || 
								   inv.source === 'cancellation' || inv.source === 'order_cancelled';
			
			if (invDate >= periodStartDate && invDate <= periodEndDate && !isCancellation) {
				newQty += inv.quantity;
			} else if (invDate >= periodStartDate && invDate <= periodEndDate && isCancellation) {
				// Cancellations in this period count as old stock being returned
				oldQty += inv.quantity;
			}
		}

		return { oldQty, newQty };
	};

	// Group inventory transactions by selected viewMode
	const groupedByPeriod = useMemo(() => {
		if (!products || products.length === 0 || !inventories || inventories.length === 0) {
			return [];
		}

		const groups: Record<string, PeriodDetail> = {};

		const inRange = (dateStr: string | null) => {
			if (!dateStr) return true;
			const d = String(dateStr).split('T')[0];
			if (fromDate && d < fromDate) return false;
			if (toDate && d > toDate) return false;
			return true;
		};

		for (const inv of inventories) {
			const rawDate = inv.created_at || new Date().toISOString();
			const dateStr = String(rawDate);
			
			// Skip zero quantity records
			if (inv.quantity <= 0) continue;
			
			// Skip cancellations/returns - they're not new stock additions
			const isCancellation = inv.type === 'return' || inv.type === 'cancellation' || 
								   inv.source === 'cancellation' || inv.source === 'order_cancelled';
			if (isCancellation) continue;
			
			if (!inRange(dateStr)) continue;
			
			const d = new Date(dateStr);
			if (Number.isNaN(d.getTime())) continue;

			let key = '';
			let label = '';
			
			if (viewMode === 'daily') {
				key = d.toISOString().slice(0, 10);
				label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
			} else if (viewMode === 'weekly') {
				const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
				const day = dt.getDay();
				const diff = (day + 6) % 7;
				dt.setDate(dt.getDate() - diff);
				const weekStart = dt.toISOString().slice(0, 10);
				key = weekStart;
				label = `Week of ${weekStart}`;
			} else if (viewMode === 'monthly') {
				key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
				const monthName = d.toLocaleString(undefined, { month: 'long' });
				label = `${monthName} ${d.getFullYear()}`;
			} else {
				key = String(d.getFullYear());
				label = key;
			}

			if (!groups[key]) groups[key] = { key, label, totalQty: 0, products: {} };
			const pid = inv.product_id ?? 0;
			const qty = Number(inv.quantity ?? 0) || 0;
			groups[key].totalQty += qty;
			
			// Find product details
			const prod = products.find(p => p.id === pid);
			const price = prod?.price || prod?.unit_price || 0;
			const prodName = prod?.product_name || prod?.name || `Product #${pid}`;
			
			// Get stock change for this product in this period
			const { oldQty, newQty } = getProductStockChange(pid, key);
			
			// Initialize product in this period if not exists
			if (!groups[key].products[pid]) {
				const finalNewQty = newQty > 0 ? newQty : qty;
				const finalOldQty = viewMode === 'annual' ? 0 : oldQty;
				const finalTotal = finalOldQty + finalNewQty;
				groups[key].products[pid] = {
					name: prodName,
					oldQty: finalOldQty,
					newQty: finalNewQty,
					totalQty: finalTotal,
					price: price,
					totalValue: finalTotal * price
				};
			}
		}

		const arr = Object.keys(groups).map(k => groups[k]);
		arr.sort((a, b) => (a.key < b.key ? 1 : -1));
		return arr;
	}, [inventories, products, viewMode, fromDate, toDate]);

	// Calculate today's business day summary (8am start)
	const todaysSummary = useMemo(() => {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0); // 8am today
		const businessDayStart = now.getHours() < 8 ? new Date(todayStart.getTime() - 24 * 60 * 60 * 1000) : todayStart; // If before 8am, use yesterday's 8am

		const summary: Record<number, {
			name: string;
			stockAt8am: number;
			addedToday: number;
			consumed: number;
			currentStock: number;
			oldStockRemaining: number;
			price: number;
			value: number;
		}> = {};

		products.forEach(prod => {
			// Skip combo meals - they don't have physical inventory
			const category = String(prod.category || '').toLowerCase();
			const productName = String(prod.product_name || prod.name || '').toLowerCase();
			
			// Filter out meals/combos by category or name patterns (contains "combo")
			if (category === 'meals' || productName.includes('combo')) {
				return;
			}

			const pid = prod.id;
			const prodName = prod.product_name || prod.name || `Product #${pid}`;
			const price = Number(prod.price || prod.unit_price || 0);

			// Get all inventory records for this product
			const prodInvs = inventories
				.filter(inv => inv.product_id === pid && inv.quantity > 0)
				.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());

			// Calculate stock at 8am (all stock added before business day start)
			let stockAt8am = 0;
			let addedToday = 0;

			prodInvs.forEach(inv => {
				const invDate = new Date(inv.created_at || '');
				// Check if it's a cancellation/return - these are old stock, not new
				const isCancellation = inv.type === 'return' || inv.type === 'cancellation' || 
									   inv.source === 'cancellation' || inv.source === 'order_cancelled';
				
				if (invDate < businessDayStart) {
					stockAt8am += inv.quantity;
				} else if (invDate >= businessDayStart && !isCancellation) {
					// Only count as "Added Today" if it's not from a cancellation
					addedToday += inv.quantity;
				} else if (invDate >= businessDayStart && isCancellation) {
					// Cancelled items returned today count as old stock
					stockAt8am += inv.quantity;
				}
			});

			const currentStock = stockAt8am + addedToday;
			// Old stock remaining is the stock from before today (stock at 8am minus what was consumed)
			// Since we don't have consumption tracking yet, old stock remaining = stock at 8am if it's still there
			const oldStockRemaining = Math.min(stockAt8am, currentStock);

			if (stockAt8am > 0 || addedToday > 0) {
				summary[pid] = {
					name: prodName,
					stockAt8am,
					addedToday,
					consumed: 0, // TODO: Calculate from sales/orders when available
					currentStock,
					oldStockRemaining,
					price: price,
					value: Number(currentStock * price)
				};
			}
		});

		return summary;
	}, [products, inventories]);

	// Calculate paginated data for Today's Summary
	const todaysSummaryArray = useMemo(() => {
		return Object.entries(todaysSummary)
			.sort(([, a], [, b]) => b.oldStockRemaining - a.oldStockRemaining)
			.map(([pid, data]) => ({ pid, ...data }));
	}, [todaysSummary]);

	const paginatedTodaysSummary = useMemo(() => {
		const start = currentPage * pageSize;
		const end = start + pageSize;
		return todaysSummaryArray.slice(start, end);
	}, [todaysSummaryArray, currentPage, pageSize]);

	const totalPages = Math.ceil(todaysSummaryArray.length / pageSize);

	// Pagination for Historical Report
	const paginatedHistoricalData = useMemo(() => {
		const start = historicalPage * historicalPageSize;
		const end = start + historicalPageSize;
		return groupedByPeriod.slice(start, end);
	}, [groupedByPeriod, historicalPage, historicalPageSize]);

	const historicalTotalPages = Math.ceil(groupedByPeriod.length / historicalPageSize);

	const handleViewDetails = (period: PeriodDetail) => {
		setSelectedPeriod(period);
		setShowModal(true);
	};

	const exportCsv = () => {
		const headers = ['Product', 'Old Stock', 'New Stock', 'Total Stock', 'Unit Price', 'Total Value'];
		const csvRows: string[][] = [];
		let overallTotal = 0;
		
		groupedByPeriod.forEach(period => {
			Object.values(period.products).forEach(prod => {
				csvRows.push([
					String(prod.name).replace(/"/g, '""'),
					String(prod.oldQty),
					String(prod.newQty),
					String(prod.totalQty),
					String(prod.price.toFixed(2)),
					String(prod.totalValue.toFixed(2))
				]);
				overallTotal += prod.totalValue;
			});
		});

		// Add empty row and overall total at the end
		csvRows.push(['', '', '', '', '', '']);
		csvRows.push(['OVERALL TOTAL', '', '', '', '', String(overallTotal.toFixed(2))]);

		const csv = [headers.join(','), ...csvRows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `inventory-report-${new Date().toISOString().slice(0,10)}.csv`;
		a.click();
	};

	const InventoryModal = ({ period, isOpen, onClose }: { period: PeriodDetail | null; isOpen: boolean; onClose: () => void }) => {
		if (!isOpen || !period) {
			return null;
		}

		const products = period?.products ? Object.values(period.products) : [];
		const periodTotal = products.reduce((sum, p) => sum + (p?.totalValue || 0), 0);

		return (
			<>
				<style>{`
					.inventory-modal-backdrop {
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
					}
				`}</style>
				<div 
					className="inventory-modal-backdrop fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm" 
					onClick={onClose}
				>
					<div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden relative z-[1000000] flex flex-col" onClick={(e) => e.stopPropagation()}>
						{/* Modal Header */}
					<div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-brand-50 to-white dark:from-gray-800 dark:to-gray-900 flex-shrink-0">
						<div>
							<h3 className="text-xl font-bold text-gray-900 dark:text-white">Inventory Details</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">{period.label}</p>
						</div>
						<button
							onClick={onClose}
							className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-all duration-200"
							aria-label="Close modal"
						>
							<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					{/* Modal Body */}
					<div className="flex-1 p-6 overflow-y-auto">
						<div className="overflow-x-auto -mx-6">
							<div className="inline-block min-w-full align-middle px-6">
								<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
									<thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
										<tr>
											<th className="py-4 px-6 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Product</th>
											<th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Old Stock</th>
											<th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">New Stock</th>
											<th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Total Stock</th>
											<th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Unit Price</th>
											<th className="py-4 px-6 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Total Value</th>
										</tr>
									</thead>
									<tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">{products.length === 0 ? (
											<tr>
												<td colSpan={6} className="py-16 px-6 text-center">
													<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
														<svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
														</svg>
													</div>
													<h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">No Products</h4>
													<p className="text-sm text-gray-500 dark:text-gray-400">There are no products in this period</p>
												</td>
											</tr>
										) : products.map((prod, idx) => {
											const price = Number(prod?.price) || 0;
											const totalValue = Number(prod?.totalValue) || 0;
											return (
												<tr key={idx} className="hover:bg-brand-50 dark:hover:bg-gray-800/80 transition-colors duration-150">
													<td className="py-4 px-6 text-sm font-medium text-gray-900 dark:text-gray-100">{prod.name}</td>
													<td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300 font-semibold">{prod.oldQty || 0}</td>
													<td className="py-4 px-6 text-sm text-right text-blue-600 dark:text-blue-400 font-semibold">{prod.newQty || 0}</td>
													<td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300 font-semibold">{prod.totalQty || 0}</td>
													<td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300">₱{price.toFixed(2)}</td>
													<td className="py-4 px-6 text-sm text-right text-gray-700 dark:text-gray-300 font-semibold">₱{totalValue.toFixed(2)}</td>
												</tr>
											);
										})}
									</tbody>
									<tfoot className="bg-gradient-to-r from-brand-100 to-brand-50 dark:from-gray-700 dark:to-gray-800 border-t-2 border-brand-400 dark:border-gray-600">
										<tr>
											<td colSpan={5} className="py-4 px-6 text-sm font-bold text-gray-900 dark:text-white uppercase">Total</td>
											<td className="py-4 px-6 text-sm text-right font-bold text-brand-700 dark:text-brand-400">₱{periodTotal.toFixed(2)}</td>
										</tr>
									</tfoot>
								</table>
							</div>
						</div>
					</div>

					{/* Modal Footer */}
					<div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
						<button
							onClick={() => {
								const headers = ['Product', 'Old Stock', 'New Stock', 'Total Stock', 'Unit Price', 'Total Value'];
								const csvRows = products.map(prod => {
									const price = Number(prod?.price) || 0;
									const totalValue = Number(prod?.totalValue) || 0;
									return [
										String(prod.name).replace(/"/g, '""'),
										String(prod.oldQty || 0),
										String(prod.newQty || 0),
										String(prod.totalQty || 0),
										String(price.toFixed(2)),
										String(totalValue.toFixed(2))
									];
								});
								const csv = [headers.join(','), ...csvRows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
								const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
								const a = document.createElement('a');
								a.href = URL.createObjectURL(blob);
								a.download = `inventory-${period.key}.csv`;
								a.click();
							}}
							className="px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
						>
							Export CSV
						</button>
					</div>
				</div>
			</div>
			</>
		);
	};

	return (
		<div className="space-y-6">
			<PageMeta title="Inventory Report" />
			<PageBreadcrumb pageTitle="Inventory Report" />

			<ComponentCard
				title={
					<div className="flex justify-between items-center">
						<div className="flex gap-2">
							<button 
								className={`px-3 py-1 rounded ${tab==='today' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 border dark:border-gray-700'}`} 
								onClick={() => setTab('today')}
							>
								Today's Summary
							</button>
							<button 
								className={`px-3 py-1 rounded ${tab==='historical' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 border dark:border-gray-700'}`} 
								onClick={() => setTab('historical')}
							>
								Historical Report
							</button>
						</div>
					</div>
				}
			>
				<div>
					{error && <div className="text-sm text-red-500 mb-4">{error}</div>}

					{/* Today's Business Day Summary Tab */}
					{tab === 'today' && (
					<div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 shadow-lg rounded-lg p-6 border-2 border-blue-200 dark:border-blue-800">
						{loading ? (
							<div className="space-y-4">
								<div className="flex items-center justify-between mb-4">
									<div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 animate-pulse"></div>
									<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
								</div>
							<div className="overflow-x-auto">
								<table className="w-full text-sm border-collapse">
									<thead className="bg-blue-100 dark:bg-gray-700">
										<tr>
											{[...Array(8)].map((_, i) => (
												<th key={i} className="px-4 py-3">
													<div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
												</th>
											))}
										</tr>
									</thead>
									<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
										{[...Array(5)].map((_, i) => (
											<tr key={i}>
												{[...Array(8)].map((_, j) => (
													<td key={j} className="px-4 py-3">
														<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
						) : (
							<>
								<div className="flex items-center justify-between mb-4">
									<h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
										<svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
										</svg>
										Today's Business Day Summary
									</h2>
									<span className="text-sm text-gray-600 dark:text-gray-400">
									Business day starts at 8:00 AM
									</span>
								</div>

							{Object.keys(todaysSummary).length === 0 ? (
								<div className="text-center py-8 text-gray-500 dark:text-gray-400">
									<svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
									</svg>
									<p className="font-medium">No inventory activity today</p>
								</div>
							) : (
								<div className="overflow-x-auto">
						<table className="w-full text-sm border-collapse">
							<thead className="bg-blue-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
								<tr>
									<th className="px-4 py-3 text-left font-bold">Product</th>
									<th className="px-4 py-3 text-center font-bold">Status</th>
											<th className="px-4 py-3 text-right font-bold">Stock at 8am</th>
									<th className="px-4 py-3 text-right font-bold">Added Today</th>
									<th className="px-4 py-3 text-right font-bold">Current Stock</th>
									<th className="px-4 py-3 text-right font-bold">Old Stock Left</th>
									<th className="px-4 py-3 text-right font-bold">Unit Price</th>
									<th className="px-4 py-3 text-right font-bold">Total Value</th>
								</tr>
							</thead>
							<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
							{paginatedTodaysSummary.map((data) => (
									<tr key={data.pid} className={`hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${data.oldStockRemaining > 0 ? 'border-l-4 border-orange-400' : ''}`}>
											<td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
												{data.name}
											</td>
											<td className="px-4 py-3 text-center">
												{data.oldStockRemaining > 0 ? (
													<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 whitespace-nowrap">
														<span className="text-[10px]">⚠️</span>
														<span>Old Stock</span>
													</span>
												) : (
													<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 whitespace-nowrap">
														<span className="text-[10px]">✓</span>
														<span>New Stock</span>
													</span>
												)}
											</td>
															<td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 font-semibold">{data.stockAt8am}</td>
											<td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-semibold">{data.addedToday}</td>
											<td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-bold">{data.currentStock}</td>
											<td className="px-4 py-3 text-right font-bold">
												<span className={data.oldStockRemaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}>
													{data.oldStockRemaining}
												</span>
											</td>
										<td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">₱{Number(data.price || 0).toFixed(2)}</td>
										<td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 font-bold">₱{Number(data.value || 0).toFixed(2)}</td>
										</tr>
									))}
							</tbody>
							<tfoot className="bg-blue-100 dark:bg-gray-700 font-bold">
								<tr>
								<td colSpan={2} className="px-4 py-3 text-gray-900 dark:text-white">TOTAL</td>
									<td className="px-4 py-3 text-right text-gray-900 dark:text-white">
															{Object.values(todaysSummary).reduce((sum, d) => sum + d.stockAt8am, 0)}
									</td>
									<td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
										{Object.values(todaysSummary).reduce((sum, d) => sum + d.addedToday, 0)}
									</td>
									<td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
										{Object.values(todaysSummary).reduce((sum, d) => sum + d.currentStock, 0)}
									</td>
									<td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400">
										{Object.values(todaysSummary).reduce((sum, d) => sum + d.oldStockRemaining, 0)}
									</td>
									<td className="px-4 py-3"></td>
									<td className="px-4 py-3 text-right text-gray-900 dark:text-white">
									₱{Object.values(todaysSummary).reduce((sum, d) => sum + Number(d.value || 0), 0).toFixed(2)}
									</td>
								</tr>
							</tfoot>
						</table>

						{/* Export Today's Report Button */}
						<div className="mt-4 flex justify-end">
							<button
								onClick={() => {
														const headers = ['Product', 'Stock at 8am', 'Added Today', 'Current Stock', 'Old Stock Left', 'Unit Price', 'Total Value'];
									const rows = Object.values(todaysSummary)
										.sort((a, b) => b.oldStockRemaining - a.oldStockRemaining)
										.map(d => [
											d.name,
											String(d.stockAtMidnight),
											String(d.addedToday),
											String(d.currentStock),
											String(d.oldStockRemaining),
											Number(d.price || 0).toFixed(2),
											Number(d.value || 0).toFixed(2)
										]);
									const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
									const blob = new Blob([csv], { type: 'text/csv' });
									const url = URL.createObjectURL(blob);
									const a = document.createElement('a');
									a.href = url;
									const now = new Date();
									a.download = `todays-inventory-${now.toISOString().slice(0, 10)}.csv`;
									a.click();
									URL.revokeObjectURL(url);
								}}
								className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								Export Today's Report
							</button>
						</div>

						{/* Pagination Controls */}
						{todaysSummaryArray.length > 0 && (
							<div className="mt-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
								<div className="flex items-center gap-2">
									<span className="text-sm text-gray-700 dark:text-gray-300">
										Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, todaysSummaryArray.length)} of {todaysSummaryArray.length} products
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
										Page {currentPage + 1} of {totalPages}
									</span>
									<button
										onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
										disabled={currentPage >= totalPages - 1}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										Next
									</button>
									<button
										onClick={() => setCurrentPage(totalPages - 1)}
										disabled={currentPage >= totalPages - 1}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										Last
									</button>
								</div>
							</div>
						)}
									</div>
								)}
							</>
						)}
					</div>
				)}

				{/* Historical Report Tab */}
				{tab === 'historical' && (
					<div>
						<div className="mb-6">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
								<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">View Mode</label>
						<select 
								value={viewMode} 
								onChange={(e) => setViewMode(e.target.value as any)} 
								className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
							>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
								<option value="annual">Annual</option>
							</select>
						</div>
						
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
							<input 
								type="date" 
								value={fromDate ?? ''} 
								onChange={(e) => setFromDate(e.target.value || null)} 
								className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
							/>
						</div>
						
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
							<input 
								type="date" 
								value={toDate ?? ''} 
								onChange={(e) => setToDate(e.target.value || null)} 
								className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
							/>
						</div>
						
						<button 
							onClick={() => { setFromDate(null); setToDate(null); }} 
							className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
						>
							Clear Filters
						</button>
						
						<button 
							onClick={() => exportCsv()} 
							className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors"
						>
							Export All
						</button>
					</div>
				</div>

				{loading ? (
					<div className="space-y-4">
						<div className="overflow-x-auto">
							<table className="w-full text-sm border-collapse">
								<thead className="bg-gray-50 dark:bg-gray-800">
									<tr>
										{[...Array(4)].map((_, i) => (
											<th key={i} className="px-4 py-3">
												<div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{[...Array(5)].map((_, i) => (
										<tr key={i} className="border-b">
											{[...Array(4)].map((_, j) => (
												<td key={j} className="px-4 py-3">
													<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				) : error ? (
					<div className="text-sm text-red-500 py-8 text-center bg-red-50 dark:bg-red-900/20 rounded-md p-4">{error}</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm text-gray-700 dark:text-gray-300 border-collapse">
							<thead className="text-xs font-semibold text-gray-700 uppercase bg-gray-50 dark:bg-gray-800">
								<tr>
									<th className="px-4 py-3 text-left">Period</th>
									<th className="px-4 py-3 text-right">Total Items</th>
									<th className="px-4 py-3 text-right">Total Value</th>
									<th className="px-4 py-3 text-center">Actions</th>
								</tr>
							</thead>
							<tbody>{groupedByPeriod.length === 0 && (
									<tr><td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-500">No transactions in the selected range</td></tr>
								)}
								{paginatedHistoricalData.map(g => {
									const periodValue = Object.values(g.products).reduce((sum, p) => sum + p.totalValue, 0);
									return (
										<tr key={g.key} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
											<td className="px-4 py-3">{g.label}</td>
											<td className="px-4 py-3 text-right font-semibold">{g.totalQty}</td>
											<td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">₱{periodValue.toFixed(2)}</td>
											<td className="px-4 py-3 text-center">
												<button 
													onClick={() => handleViewDetails(g)}
													className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors"
												>
													View Details
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>

						{/* Historical Report Pagination Controls */}
						{groupedByPeriod.length > 0 && (
							<div className="mt-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
								<div className="flex items-center gap-2">
									<span className="text-sm text-gray-700 dark:text-gray-300">
										Showing {historicalPage * historicalPageSize + 1} to {Math.min((historicalPage + 1) * historicalPageSize, groupedByPeriod.length)} of {groupedByPeriod.length} periods
									</span>
									<select
										value={historicalPageSize}
										onChange={(e) => {
											setHistoricalPageSize(Number(e.target.value));
											setHistoricalPage(0);
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
										onClick={() => setHistoricalPage(0)}
										disabled={historicalPage === 0}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										First
									</button>
									<button
										onClick={() => setHistoricalPage(p => Math.max(0, p - 1))}
										disabled={historicalPage === 0}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										Previous
									</button>
									<span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
										Page {historicalPage + 1} of {historicalTotalPages}
									</span>
									<button
										onClick={() => setHistoricalPage(p => Math.min(historicalTotalPages - 1, p + 1))}
										disabled={historicalPage >= historicalTotalPages - 1}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										Next
									</button>
									<button
										onClick={() => setHistoricalPage(historicalTotalPages - 1)}
										disabled={historicalPage >= historicalTotalPages - 1}
										className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
									>
										Last
									</button>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		)}
		</div>
		</ComponentCard>

			<InventoryModal period={selectedPeriod} isOpen={showModal} onClose={() => setShowModal(false)} />
		</div>
	);
}

