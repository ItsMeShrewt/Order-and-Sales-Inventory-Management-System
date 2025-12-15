import { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Link, useNavigate } from "react-router";
import api from "../../lib/axios";
import { useProductNotification } from "../../context/ProductNotificationContext";

export default function NotificationDropdown() {
  const navigate = useNavigate();
  const { setHighlightedProductId } = useProductNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [lowStock, setLowStock] = useState<Array<any>>([]);
  const [outOfStock, setOutOfStock] = useState<Array<any>>([]);
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [failedImageIds, setFailedImageIds] = useState<Set<number>>(new Set());
  const LOW_STOCK_THRESHOLD = 10;

  const normalizeImage = (value: any): string | null => {
    if (!value && value !== 0) return null;
    const raw = String(value);
    let out: string | null = null;
    if (raw.startsWith('http') || raw.startsWith('//')) out = raw;
    else if (raw.startsWith('/')) out = raw;
    else if (raw.startsWith('storage/')) out = `/${raw}`;
    else out = `/storage/${raw}`;
    if (process.env.NODE_ENV !== 'production') console.debug('[normalizeImage] raw -> normalized', raw, '->', out);
    return out;
  };

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const handleClick = () => {
    toggleDropdown();
    setNotifying(false);
  };

  useEffect(() => {
    let mounted = true;
    const loadLowStock = async () => {
      try {
        const [prodRes, invRes] = await Promise.all([api.get('/products'), api.get('/inventories')]);
        const products = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        const inventories = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];

        const stockMap: Record<number, number> = {};
        for (const inv of inventories) {
          const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
          const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
          if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
        }

        const computed = products.map((p: any) => {
          const base = (stockMap[p.id] ?? (p.quantity ?? p.stock ?? 0));
          const qty = Number(base || 0);
          return { ...p, _computedQty: qty };
        });

        // Filter out non-stockable products from notifications
        const stockableOnly = computed.filter((p: any) => p.is_stockable !== false && p.is_stockable !== 0);

        const low = stockableOnly.filter((p: any) => p._computedQty > 0 && p._computedQty <= LOW_STOCK_THRESHOLD && !acknowledged.includes(Number(p.id)));
        const out = stockableOnly.filter((p: any) => p._computedQty === 0 && !acknowledged.includes(Number(p.id)));

        if (!mounted) return;
        setLowStock(low);
        setOutOfStock(out);
        setNotifying(low.length + out.length > 0);
      } catch (e) {
        // ignore network issues silently
      }
    };
    loadLowStock();
    // refresh periodically while dropdown closed
    const id = setInterval(loadLowStock, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [acknowledged]);

  useEffect(() => {
    // clear failed images when the product set is refreshed
    setFailedImageIds(new Set());
  }, [outOfStock, lowStock]);

  // Retry failed notification images after a short delay so they will be
  // attempted again if the backend becomes available shortly after a
  // first failed request.
  useEffect(() => {
    if (failedImageIds.size === 0) return;
    const t = setTimeout(() => setFailedImageIds(new Set()), 3000);
    return () => clearTimeout(t);
  }, [failedImageIds]);

  const dismissAlert = (id: number) => {
    setAcknowledged((a) => Array.from(new Set([...a, id])));
    setLowStock((l) => l.filter((p) => Number(p.id) !== Number(id)));
    setOutOfStock((o) => o.filter((p) => Number(p.id) !== Number(id)));
  };

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleClick}
      >
        {notifying && (
          <span className="absolute -right-0.5 -top-0.5 z-10 flex items-center justify-center">
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-orange-400 text-white text-xs font-medium">{lowStock.length + outOfStock.length}</span>
            <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping -z-10"></span>
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notification</h5>
          <button
            onClick={toggleDropdown}
            aria-label="Close notifications"
            className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {outOfStock.length > 0 && (
            <li className="px-2 pb-2">
              <div className="mb-2 text-sm font-medium text-red-600 dark:text-red-400">Out of stock</div>
              {outOfStock.map((p: any) => (
                <DropdownItem
                  key={`out-${p.id}`}
                  onItemClick={() => {}}
                  className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="relative block w-full h-10 rounded-full max-w-10">
                    {/* background circle sits behind the image */}
                    <span className="absolute inset-0 block w-full h-full bg-gray-100 dark:bg-gray-800 rounded-full -z-10" aria-hidden="true" />
                    {(() => {
                      let src = normalizeImage(p.image_url ?? p.image ?? p.image_path);
                      // Always try to render the actual product photo first
                      if (!src) {
                        src = '/images/product/product-06.jpg';
                      }
                      return (
                        <img
                          key={`notif-img-${p.id}-${String(src)}`}
                          width={40}
                          height={40}
                          src={src}
                          alt={p.product_name || p.name}
                          className="relative w-full h-full object-cover rounded-full z-20"
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.onerror = null;
                            setFailedImageIds((s) => new Set(Array.from(s).concat([Number(p.id)])));
                            el.src = '/images/product/product-06.jpg';
                          }}
                        />
                      );
                    })()}
                  </span>
                  <span className="block w-full">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400 space-x-1">
                          <span className="font-medium text-gray-800 dark:text-white/90">{p.product_name || p.name}</span>
                          <span className="text-xs text-red-600">is out of stock</span>
                        </span>
                      </div>
                      <div className="ml-2 flex flex-col items-end gap-2">
                        <span onClick={() => dismissAlert(Number(p.id))} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Dismiss</span>
                        <button 
                          onClick={() => {
                            setHighlightedProductId(Number(p.id));
                            setIsOpen(false);
                            navigate('/products');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </span>
                </DropdownItem>
              ))}
            </li>
          )}

          {lowStock.length > 0 ? (
            <li className="px-2 pb-2">
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Low stock alerts</div>
              {lowStock.map((p: any) => (
                <DropdownItem
                  key={`low-${p.id}`}
                  onItemClick={() => {}}
                  className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="relative block w-full h-10 rounded-full z-20 max-w-10">
                    <img
                      width={40}
                      height={40}
                      src={normalizeImage(p.image_url ?? p.image ?? p.image_path) || '/images/product/product-06.jpg'}
                      alt={p.product_name || p.name}
                      className="w-full overflow-hidden rounded-full z-20"
                    />
                  </span>

                  <span className="block w-full">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400 space-x-1">
                          <span className="font-medium text-gray-800 dark:text-white/90">{p.product_name || p.name}</span>
                          <span className="text-xs text-gray-600">is low on stock</span>
                        </span>
                        <span className="flex items-center gap-2 text-gray-500 text-theme-xs dark:text-gray-400">
                          <span>Remaining:</span>
                          <span className="font-semibold">{p._computedQty}</span>
                        </span>
                      </div>
                      <div className="ml-2 flex flex-col items-end gap-2">
                        <span onClick={() => dismissAlert(Number(p.id))} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Dismiss</span>
                        <button 
                          onClick={() => {
                            setHighlightedProductId(Number(p.id));
                            setIsOpen(false);
                            navigate('/products');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </span>
                </DropdownItem>
              ))}
            </li>
          ) : null}
        </ul>

        <Link
          to="/products"
          className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          View Products
        </Link>
      </Dropdown>
    </div>
  );
}
