import React, { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import { useOrders } from "../../context/OrderContext";
import api from "../../lib/axios";

interface Product {
  id: number;
  product_name?: string;
  name?: string;
  productName?: string;
  category?: string | { category_name?: string; name?: string };
  category_id?: string;
  category_label?: string;
  category_name?: string;
  stock?: number;
  price?: number | string;
  image?: string;
  image_url?: string;
  [key: string]: any;
}

const ProductGrid: React.FC = () => {
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
  const { addToOrder, orders } = useOrders();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCategoryLabel, setActiveCategoryLabel] = useState<string | null>(null);
  const [bundleComponents, setBundleComponents] = useState<Record<number, Array<{id: number, quantity: number}>>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [archivedProducts, setArchivedProducts] = useState<Set<string>>(new Set());
  const itemsPerPage = 30; // 5 columns x 6 rows

  // Calculate available stock considering cart reservations
  const getAvailableStock = (productId: number, baseStock: number): number => {
    let reserved = 0;
    
    // Count direct reservations (product itself in cart)
    const directOrder = orders.find(o => o.id === productId);
    if (directOrder) {
      reserved += directOrder.quantity;
    }
    
    // Count reservations from bundles in cart
    for (const order of orders) {
      if (order.is_bundle) {
        const components = bundleComponents[order.id];
        if (components) {
          const component = components.find(c => c.id === productId);
          if (component) {
            reserved += component.quantity * order.quantity;
          }
        }
      }
    }
    
    return Math.max(0, baseStock - reserved);
  };
  
  // Helper function to check if a product contains any archived ingredient
  const containsArchivedIngredient = (product: any): boolean => {
    if (!product) return false;
    
    const productName = (product.product_name || product.name || '').toLowerCase().trim();
    
    // Check if the product itself is an archived ingredient
    if (archivedProducts.has(productName)) {
      console.log('[ProductGrid] ✗ Product itself is archived:', productName);
      return true;
    }
    
    // Check if bundle contains any archived ingredients
    if (!product.is_bundle || !product.bundle_items || !Array.isArray(product.bundle_items)) {
      return false;
    }
    
    // Check both the bundled product status and the ingredient name in archived set
    const hasArchived = product.bundle_items.some((item: any) => {
      // Check status directly from bundle_items (added in API response)
      if (item.status === 'archived') {
        console.log('[ProductGrid] ✗ Bundle ingredient is archived:', item.product_name, 'in product:', productName);
        return true;
      }
      
      // Also check by name in archived set
      const bundledProduct = item.bundled_product || item.product;
      if (!bundledProduct && item.product_name) {
        // Use product_name from bundle_items if bundled_product not present
        const name = (item.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[ProductGrid] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      if (bundledProduct) {
        const name = (bundledProduct.name || bundledProduct.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[ProductGrid] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      return false;
    });
    
    return hasArchived;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Add cache-busting query parameter to force fresh data
      const timestamp = Date.now();
      const [prodRes, invRes] = await Promise.all([
        api.get(`/products?_t=${timestamp}`), 
        api.get(`/inventories?_t=${timestamp}`)
      ]);
      const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
      const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];

      // build stock map
      const stockMap: Record<number, number> = {};
      for (const inv of invData) {
        const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
        const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
        if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
      }

      const normalized = prodData.map((p: any) => {
        // Normalize image: prefer `image_url`, otherwise compute a usable
        // path (starting with '/' or 'http') for storage paths returned in
        // `image` or `image_path`. Null indicates no backend image.
        let img: string | null = null;
        if (p.image_url) img = normalizeImage(p.image_url);
        else if (p.image) img = normalizeImage(p.image);
        else if (p.image_path) img = normalizeImage(p.image_path);

        const calculatedStock = p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? (p.quantity ?? p.stock ?? 0));
        const isStockable = p.is_stockable === undefined || p.is_stockable === null ? true : Boolean(p.is_stockable);
        
        // Store bundle components for stock calculation
        if (p.is_bundle && p.bundle_items && Array.isArray(p.bundle_items)) {
          const components: Array<{id: number, quantity: number}> = [];
          for (const item of p.bundle_items) {
            const bundledProductId = item.bundled_product?.id ?? item.bundled_product_id;
            if (bundledProductId) {
              components.push({
                id: bundledProductId,
                quantity: item.quantity ?? 1
              });
            }
          }
          setBundleComponents(prev => ({ ...prev, [p.id]: components }));
        }
        
        return {
          ...p,
          id: p.id,
          product_name: p.product_name ?? p.name ?? p.productName ?? p.title,
          // normalize both category label and id when available
          category_label: typeof p.category === "string" ? p.category : p.category?.category_name ?? p.category_name ?? "",
          category_id: typeof p.category === 'object' && p.category?.id ? String(p.category.id) : (p.category_id ? String(p.category_id) : (p.categoryId ? String(p.categoryId) : '')),
          category: typeof p.category === "string" ? p.category : p.category?.category_name ?? p.category_name ?? "",
          price: p.price ?? p.amount ?? p.cost,
          image: img,
          // Use calculated_stock for bundles, otherwise use inventory stock
          stock: calculatedStock,
          is_bundle: Boolean(p.is_bundle),
          is_stockable: isStockable,
        } as Product;
      }).sort((a: Product, b: Product) => {
        const nameA = (a.product_name || a.name || '').toLowerCase();
        const nameB = (b.product_name || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setProducts(normalized);
      console.debug('[ProductGrid] Fetched and normalized products:', normalized.length, 'products with updated stock');
      
      // Debug bundle products
      const bundles = normalized.filter((p: any) => p.is_bundle);
      if (bundles.length > 0) {
        console.log('[ProductGrid] Bundle products:', bundles.map((p: any) => ({
          id: p.id,
          name: p.product_name,
          is_bundle: p.is_bundle,
          is_stockable: p.is_stockable,
          stock: p.stock
        })));
      }
    } catch (err) {
      console.warn('ProductGrid fetch error', err);
      // surface an actionable message if it's a network error
      let message = 'Failed to load products.';
      try {
        const em = (err as any)?.message || '';
        if (String(em).toLowerCase().includes('network error')) {
          message = 'Network error — cannot reach API. Ensure backend (127.0.0.1:8000) and frontend dev server (npm run dev) are running.';
        } else if ((err as any)?.response?.data?.message) {
          message = (err as any).response.data.message;
        }
      } catch {}
      setError(message);
    } finally {
      setLoading(false);
    }
  };
  
  // Check for archived key ingredients by fetching all products (including archived ones)
  useEffect(() => {
    const checkArchivedIngredients = async () => {
      try {
        const timestamp = Date.now();
        const res = await api.get(`/products?_t=${timestamp}`);
        const allProducts = Array.isArray(res.data) ? res.data : res.data.data || [];
        
        // Key ingredients to check (lowercase for comparison)
        const keyIngredients = ['egg', 'rice', 'pancit canton', 'corned beef', 'beef loaf'];
        const archived = new Set<string>();
        
        console.log('[ProductGrid] Checking all products for archived ingredients...');
        console.log('[ProductGrid] Total products fetched:', allProducts.length);
        
        // Find all archived products matching key ingredients
        keyIngredients.forEach(ingredientName => {
          const product = allProducts.find((p: any) => {
            const name = (p.product_name || p.name || '').toLowerCase().trim();
            const isMatch = name === ingredientName;
            const isArchived = p.status === 'archived';
            
            if (isMatch) {
              console.log('[ProductGrid] Found ingredient:', ingredientName, 'status:', p.status, 'archived:', isArchived);
            }
            
            return isMatch && isArchived;
          });
          
          if (product) {
            console.log('[ProductGrid] ✓ Adding to archived set:', ingredientName);
            archived.add(ingredientName);
          }
        });
        
        console.log('[ProductGrid] Archived ingredients:', Array.from(archived));
        setArchivedProducts(archived);
      } catch (err) {
        console.error('[ProductGrid] Failed to check archived ingredients:', err);
      }
    };
    
    checkArchivedIngredients();
  }, []);
  useEffect(() => {
    console.debug('[ProductGrid] Component mounted, calling initial fetchData');
    fetchData();
    
    const onRefresh = () => {
      console.debug('[ProductGrid] Refresh event received, reloading products...');
      // Force loading state to show spinner
      setLoading(true);
      // Clear products to force re-render
      setProducts([]);
      // Small delay to ensure the event is properly processed
      setTimeout(() => {
        console.debug('[ProductGrid] Starting delayed fetchData after refresh event');
        fetchData();
      }, 100);
    };
    
    const onSearch = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        const q = String(detail.query ?? "").trim();
        setQuery(q);
      } catch (e) {
        setQuery("");
      }
    };
    
    const onCategory = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        const cat = String(detail.category ?? "").trim();
        const label = String(detail.label ?? "").trim();
        setActiveCategory(cat === 'all' || cat === '' ? null : cat);
        setActiveCategoryLabel(label === '' ? null : label.toLowerCase());
      } catch (e) {
        setActiveCategory(null);
      }
    };
    
    // Listen for storage events (triggered in other windows/tabs when order is placed)
    const onStorageChange = (ev: StorageEvent) => {
      if (ev.key === 'app:order-placed' || ev.key === 'order:cancelled' || ev.key === 'products:refresh') {
        console.debug('[ProductGrid] Storage event detected:', ev.key, ', refreshing products...');
        fetchData();
      }
    };
    
    console.debug('[ProductGrid] Adding event listeners');
    window.addEventListener("products:refresh", onRefresh as EventListener);
    window.addEventListener("products:search", onSearch as EventListener);
    window.addEventListener("products:filterCategory", onCategory as EventListener);
    window.addEventListener("storage", onStorageChange);
    
    return () => {
      console.debug('[ProductGrid] Removing event listeners');
      window.removeEventListener("products:refresh", onRefresh as EventListener);
      window.removeEventListener("products:search", onSearch as EventListener);
      window.removeEventListener("products:filterCategory", onCategory as EventListener);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);
  // (listeners cleanup is handled in the effect above)

  useEffect(() => {
    setFailedImageIds(new Set());
  }, [products]);

  // Force re-render when orders change to update available stock
  useEffect(() => {
    // Trigger a re-render by updating a dummy state or forcing component update
    // The getAvailableStock function will recalculate based on current orders
  }, [orders, bundleComponents]);

  // Retry failed images shortly after they were recorded — this helps
  // when server-side fixes occur shortly after first failure.
  useEffect(() => {
    if (failedImageIds.size === 0) return;
    const t = setTimeout(() => setFailedImageIds(new Set()), 3000);
    return () => clearTimeout(t);
  }, [failedImageIds]);

  // Filter and process products
  const filteredProducts = products
    .filter((p) => {
      // Hide individual Corned Beef and Beef Loaf (only sold as part of Rice combo)
      const productName = String(p.product_name ?? p.productName ?? p.name ?? "").toLowerCase();
      if (productName === 'corned beef' || productName === 'beef loaf') {
        return false;
      }
      
      // Hide archived standalone products (not bundles)
      // Bundles with archived ingredients will be shown but disabled
      if (p.status === 'archived' && !p.is_bundle) {
        return false;
      }
      
      return true;
    })
    .filter((p) => {
      if (!query) return true;
      const lower = query.toLowerCase();
      const name = String(p.product_name ?? p.productName ?? p.name ?? "").toLowerCase();
      const category = String(p.category ?? "").toLowerCase();
      return name.includes(lower) || category.includes(lower);
    })
    .filter((p) => {
      // If no category filter, show all products
      if (!activeCategory) return true;
      
      const normalizedActiveLabel = (activeCategoryLabel ?? '').toLowerCase();
      
      // Check category_id (numeric ID from database) - exact match
      const productCategoryId = String(p.category_id ?? '');
      if (productCategoryId && productCategoryId === activeCategory) {
        return true;
      }
      
      // Check category object if it exists
      if (p.category && typeof p.category === 'object') {
        const catObj = p.category as any;
        const catId = String(catObj.id ?? '');
        const catName = String(catObj.category_name ?? catObj.name ?? '').toLowerCase();
        
        // Match by category ID
        if (catId && catId === activeCategory) return true;
        
        // Match by category name
        if (normalizedActiveLabel && catName === normalizedActiveLabel) return true;
      }
      
      // Check category as string - exact match by name
      if (normalizedActiveLabel) {
        const productCategoryStr = String(p.category ?? '').toLowerCase();
        if (productCategoryStr === normalizedActiveLabel) return true;
      }
      
      return false;
    });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  // Reset to page 0 when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [query, activeCategory]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-2 transition-all duration-300" style={{ gridAutoRows: '1fr' }}>
      {loading && (
        <>
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden animate-pulse h-full flex flex-col">
              <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
              <div className="p-3 space-y-2 flex-grow flex flex-col">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mx-auto"></div>
                <div className="flex-grow"></div>
                <div className="flex items-center justify-center gap-2 mt-auto">
                  <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
                <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              </div>
            </div>
          ))}
        </>
      )}

      {error && (
        <div className="col-span-full p-4 rounded-lg bg-red-50 text-sm text-red-700 border border-red-100">
          {error}
        </div>
      )}

      {paginatedProducts.map((product) => {
          // Calculate available stock considering cart reservations
          const baseStock = typeof product.stock === 'number' ? product.stock : 999;
          let availableStock = baseStock;
          
          if (product.is_stockable && !product.is_bundle) {
            availableStock = getAvailableStock(product.id, baseStock);
          } else if (product.is_bundle) {
            const components = bundleComponents[product.id];
            if (components && components.length > 0) {
              let minBundleStock = Infinity;
              let hasStockableComponent = false;
              
              for (const comp of components) {
                const compProduct = products.find(p => p.id === comp.id);
                if (compProduct && compProduct.is_stockable) {
                  hasStockableComponent = true;
                  const compBaseStock = typeof compProduct.stock === 'number' ? compProduct.stock : 0;
                  const compAvailableStock = getAvailableStock(comp.id, compBaseStock);
                  const possibleBundles = Math.floor(compAvailableStock / comp.quantity);
                  minBundleStock = Math.min(minBundleStock, possibleBundles);
                }
              }
              
              // If bundle has stockable components, use calculated stock, otherwise unlimited
              availableStock = hasStockableComponent 
                ? (minBundleStock === Infinity ? 0 : minBundleStock)
                : 999;
            } else {
              availableStock = baseStock;
            }
          } else {
            availableStock = 999;
          }

          // Filter out failed images
          const productWithValidImage = failedImageIds.has(product.id)
            ? { ...product, image: null }
            : product;
          
          // Normalize product for ProductCard
          const normalizedProduct = {
            ...productWithValidImage,
            category: typeof productWithValidImage.category === 'string' 
              ? productWithValidImage.category 
              : productWithValidImage.category?.category_name || productWithValidImage.category?.name || ''
          };
          
          return (
            <ProductCard
              key={product.id}
              product={normalizedProduct}
              availableStock={availableStock}
              onAddToCart={(_productId, quantity, notes) => {
                const item = {
                  id: product.id,
                  productName: String(product.product_name ?? product.productName ?? product.name ?? ""),
                  category: product.category_label ?? (typeof product.category === "string" ? product.category : product.category?.category_name ?? product.category_name ?? ""),
                  category_id: product.category_id ?? null,
                  price: Number(product.price) || 0,
                  image: product.image ?? null,
                  stock: typeof product.stock === 'number' ? product.stock : undefined,
                  is_bundle: product.is_bundle,
                  is_stockable: product.is_stockable,
                  notes: notes || undefined,
                } as any;
                for (let i = 0; i < quantity; i++) {
                  addToOrder(item);
                }
              }}
              onImageError={(productId) => {
                setFailedImageIds((s) => new Set(Array.from(s).concat([productId])));
              }}
              isRiceUnavailable={containsArchivedIngredient(product)}
            />
          );
        })}

      {!loading && products.length === 0 && !error && (
        <div className="col-span-full p-6 text-center text-sm text-gray-500">
          No products available right now.
        </div>
      )}
    </div>

    {/* Pagination Controls */}
    {!loading && filteredProducts.length > itemsPerPage && (
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
          disabled={currentPage === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
        >
          ← Previous
        </button>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Page {currentPage + 1} of {totalPages}
        </div>
        <button
          onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
          disabled={currentPage >= totalPages - 1}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
        >
          Next →
        </button>
      </div>
    )}
  </div>
  );
};

export default ProductGrid;
