import { useEffect, useState } from 'react';
import api from '../../lib/axios';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
// Badge previously used for a 'Status' column; currently unused — remove import to avoid build errors

interface TopProduct {
  id: number;
  name: string;
  image?: string | null;
  category?: string | null;
  quantitySold: number;
  totalRevenue: number;
}

const normalizeImage = (value: any): string | null => {
  if (!value && value !== 0) return null;
  const raw = String(value);
  if (raw.startsWith('http') || raw.startsWith('//')) return raw;
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('storage/')) return `/${raw}`;
  // default assume it's a storage path
  return `/storage/${raw}`;
};

/**
 * Fetches completed orders (admin only) and aggregates top-selling products.
 */
const useTopProducts = (limit = 5) => {
  const [top, setTop] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // completed orders have sale relation
        const [res, prodRes] = await Promise.all([
          api.get('/orders/completed'),
          api.get('/products'),
        ]);
        const orders = Array.isArray(res.data) ? res.data : res.data.data || [];
        const products = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];

        // build product map for fallback category lookup (id -> category_name)
        const productMap: Record<number, any> = {};
        for (const p of products) {
          productMap[Number(p.id)] = p;
        }

        // aggregate order_items across completed orders
        const map: Record<number, TopProduct> = {};

        for (const order of orders) {
          const items = order?.order_items || order?.orderItems || [];
          for (const it of items) {
            const pid = Number(it.product_id ?? it.product?.id ?? it.product_id ?? it.id);
            const pname = it.product?.product_name ?? it.product?.name ?? it.product_name ?? it.name ?? 'Unknown';
            const pimg = it.product?.image_url ?? it.product?.image ?? null;
            const pimgNorm = normalizeImage(pimg);
            const rawCat = it.product?.category ?? it.product?.category_name ?? null;
            // Normalize category into a single display string
            let pcat: string | null = null;
            if (rawCat) {
              if (typeof rawCat === 'string') pcat = rawCat;
              else pcat = rawCat?.category_name ?? rawCat?.name ?? String(rawCat) ?? null;
            }
            // If pcat is still null, try fallback lookup using productMap category
            if (!pcat) {
              const productFromMap = productMap[pid];
              if (productFromMap) {
                pcat = productFromMap?.category?.category_name ?? productFromMap?.category_name ?? null;
              }
            }

            // Ensure we don't store an empty string — use null instead so UI uses fallback
            if (pcat !== null) pcat = String(pcat).trim() || null;
            const qty = Number(it.quantity ?? 0);
            const price = Number(it.price ?? it.product?.price ?? 0);

            if (!map[pid]) map[pid] = { id: pid, name: pname, image: pimgNorm, category: pcat || '—', quantitySold: 0, totalRevenue: 0 };
            map[pid].quantitySold += qty;
            map[pid].totalRevenue += qty * price;
          }
        }

        const arr = Object.values(map).sort((a, b) => b.quantitySold - a.quantitySold).slice(0, limit);
        if (isMounted) setTop(arr);
      } catch (e: any) {
        console.warn('Failed to load completed orders for top products', e);
        if (isMounted) setError((e?.response?.data?.message) || e?.message || 'Failed to load top products');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [limit]);

  return { top, loading, error };
};

export default function RecentOrders() {
  const { top, loading, error } = useTopProducts(5);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
      {loading ? (
        <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-700 dark:to-gray-800 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 -mt-4 rounded-t-2xl animate-pulse">
          <div className="h-7 w-48 bg-gray-200 dark:bg-gray-600 rounded"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-r from-brand-500 to-brand-600 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 -mt-4 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Most Sold Products
            </h3>
          </div>

          {/* header actions removed: Filter & See all buttons removed per request */}
        </div>
      )}
      <div className="max-w-full overflow-x-auto">
          <Table>
          {/* Table Header */}
          {loading ? (
            <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
              <TableRow>
                <TableCell isHeader className="py-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </TableCell>
                <TableCell isHeader className="py-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </TableCell>
                <TableCell isHeader className="py-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </TableCell>
              </TableRow>
            </TableHeader>
          ) : (
            <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
              <TableRow>
                <TableCell
                  isHeader
                  className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Products
                </TableCell>
                <TableCell
                  isHeader
                  className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Revenue
                </TableCell>
                <TableCell
                  isHeader
                  className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Category
                </TableCell>
              </TableRow>
            </TableHeader>
          )}

          {/* Table Body */}

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading && (
              <>
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 animate-pulse">
                        <div className="h-[50px] w-[50px] bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 animate-pulse"></div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}

            {!loading && error && (
              <TableRow>
                <TableCell className="py-4 text-sm text-red-600" colSpan={4}>{error}</TableCell>
              </TableRow>
            )}

            {!loading && top.map((product) => (
              <TableRow key={product.id} className="">
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-[50px] w-[50px] overflow-hidden rounded-md bg-gray-100">
                      {product.image ? (
                        <img
                          src={product.image}
                          className="h-[50px] w-[50px] object-cover"
                          alt={product.name}
                        />
                      ) : (
                        <div className="h-[50px] w-[50px] flex items-center justify-center text-xs text-gray-400">No Image</div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {product.name}
                      </p>
                      <span className="text-gray-500 text-theme-xs dark:text-gray-400">{product.quantitySold} sold</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  ₱{product.totalRevenue.toFixed(2)}
                </TableCell>
                <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                  {product.category ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
