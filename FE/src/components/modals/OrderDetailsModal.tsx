import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal';
import api from '../../lib/axios';
import Button from '../ui/button/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: number | null;
  showActions?: boolean;
  onConfirmClick?: () => void;
  onCancelClick?: () => void;
}

const normalizeImage = (value: any): string | null => {
  if (!value && value !== 0) return null;
  const raw = String(value);
  if (raw.startsWith('http') || raw.startsWith('//')) return raw;
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('storage/')) return `/${raw}`;
  return `/storage/${raw}`;
};

export default function OrderDetailsModal({ isOpen, onClose, orderId, showActions = false, onConfirmClick, onCancelClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/orders/${orderId}`);
        if (!mounted) return;
        console.log('Order Details Response:', res.data);
        setOrder(res.data);
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || 'Failed to load order');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen, orderId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl m-4">
      <div className="flex flex-col max-h-[80vh] w-full">
        {/* Header - stays visible */}
        <div className="px-6 py-4 border-b bg-white dark:bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Order Details</h3>
            {order && (
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-gray-600 dark:text-gray-400">
                  {order.order_alias || `Order #${order.id}`}
                </span>
                {order.sale && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-medium text-sm">
                    <span>✔️</span>
                    <span>Completed</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                    </div>
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 ml-auto"></div>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-red-500">{error}</div>}

          {!loading && order && (
            <div>
              <div className="mb-4 text-sm text-gray-600">Placed: {new Date(order.created_at).toLocaleString()}</div>
              <div className="mb-2 font-medium">Items</div>
              <ul className="space-y-3">
                {(order.order_items || order.orderItems || []).map((it: any) => (
                  <li key={it.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                      {it.product?.image_url || it.product?.image ? (
                        <img
                          src={normalizeImage(it.product?.image_url ?? it.product?.image) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3C/svg%3E"}
                          alt={it.product?.product_name ?? it.product?.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="font-medium text-sm">{it.product?.product_name ?? it.product?.name ?? '—'}</div>
                      <div className="text-xs text-gray-500">Qty: {it.quantity} · ₱{it.price}</div>
                      {(() => {
                        // Handle both camelCase (from state) and snake_case (from API)
                        const prefs = it.cookingPreferences || it.cooking_preferences;
                        const hasPrefs = prefs && typeof prefs === 'object' && Object.values(prefs).some((v: any) => typeof v === 'number' && v > 0);
                        return hasPrefs ? (
                          <div className="text-xs mt-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded border-l-2 border-amber-500">
                            <span className="font-semibold text-amber-700 dark:text-amber-400">🍳 Egg Breakdown:</span>
                            <div className="mt-1 space-y-0.5">
                              {(prefs['Sunny Side Up'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Sunny Side Up: {prefs['Sunny Side Up']}</div>}
                              {(prefs['Boiled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Boiled: {prefs['Boiled']}</div>}
                              {(prefs['Scrambled'] ?? 0) > 0 && <div className="text-amber-700 dark:text-amber-300">• Scrambled: {prefs['Scrambled']}</div>}
                            </div>
                          </div>
                        ) : it.notes ? (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border-l-2 border-amber-500">
                            <span className="font-semibold text-amber-700 dark:text-amber-400">🍳 Egg Cooking:</span> {it.notes}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="w-20 text-right font-medium">₱{(it.quantity * it.price).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer - stays visible */}
        <div className="px-6 py-4 border-t bg-white dark:bg-gray-900 flex items-center justify-between">
          <div className="text-sm font-semibold">Total: ₱{order?.total_amount ?? '0.00'}</div>
          {showActions && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                onCancelClick?.();
                onClose();
              }} className="bg-red-500 text-white hover:bg-red-600">Cancel</Button>
              <Button size="sm" onClick={() => {
                onConfirmClick?.();
                onClose();
              }} className="bg-green-500 text-white hover:bg-green-600">Confirm</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
