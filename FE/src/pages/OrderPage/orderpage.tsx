import { useState, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ProductGrid from "../../components/card/ProductGrid";
import Button from "../../components/ui/button/Button";
import ComponentCard from "../../components/common/ComponentCard";
import { useOrders } from "../../context/OrderContext";
import AdminSelectedSidebar from "../../layout/AdminSelectedSidebar"; // Admin sidebar with no PC locking
import Category from "../../components/common/Category";
import api from "../../lib/axios";
import { ShoppingCart, Plus, Minus } from "lucide-react";

export default function OrderPage() {
  const [isOpen, setIsOpen] = useState(false);
  const { orders, addToOrder } = useOrders();
  const [categories, setCategories] = useState<{id:string; label:string}[]>([{ id: 'all', label: 'All' }]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [bestSellers, setBestSellers] = useState<any[]>([]);
  const [meals, setMeals] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]); // For component lookup
  const [mealsBundleComponents, setMealsBundleComponents] = useState<Record<number, Array<{id: number, quantity: number}>>>({});
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [bestSellerQuantities, setBestSellerQuantities] = useState<Record<number, number>>({});
  const [mealsQuantities, setMealsQuantities] = useState<Record<number, number>>({});
  const [bestSellersPage, setBestSellersPage] = useState(0);
  const [mealsPage, setMealsPage] = useState(0);
  const [bestSellersLoading, setBestSellersLoading] = useState(true);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [archivedProducts, setArchivedProducts] = useState<Set<string>>(new Set());
  const itemsPerPage = 5;
  
  // Helper function to check if a product contains any archived ingredient
  const containsArchivedIngredient = (product: any): boolean => {
    if (!product) return false;
    
    const productName = (product.product_name || product.name || '').toLowerCase().trim();
    
    // Check if the product itself is an archived ingredient
    if (archivedProducts.has(productName)) {
      console.log('[orderpage] ✗ Product itself is archived:', productName);
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
        console.log('[orderpage] ✗ Bundle ingredient is archived:', item.product_name, 'in product:', productName);
        return true;
      }
      
      // Also check by name in archived set
      const bundledProduct = item.bundled_product || item.product;
      if (!bundledProduct && item.product_name) {
        // Use product_name from bundle_items if bundled_product not present
        const name = (item.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[orderpage] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      if (bundledProduct) {
        const name = (bundledProduct.name || bundledProduct.product_name || '').toLowerCase().trim();
        const isArchived = archivedProducts.has(name);
        if (isArchived) {
          console.log('[orderpage] ✗ Bundle contains archived ingredient (by name):', name, 'in product:', productName);
        }
        return isArchived;
      }
      
      return false;
    });
    
    return hasArchived;
  };
  
  // Calculate available stock considering cart reservations for meals
  const getMealAvailableStock = (productId: number, baseStock: number): number => {
    let reserved = 0;
    
    // Count direct reservations (product itself in cart)
    const directOrder = orders.find(o => o.id === productId);
    if (directOrder) {
      reserved += directOrder.quantity;
    }
    
    // Count reservations from bundles in cart
    for (const order of orders) {
      if (order.is_bundle) {
        const components = mealsBundleComponents[order.id];
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

  // Check for archived key ingredients
  const checkArchivedIngredients = async () => {
    try {
      const res = await api.get('/products');
      const allProducts = Array.isArray(res.data) ? res.data : res.data.data || [];
      
      // Key ingredients to check: egg, rice, pancit canton
    const keyIngredients = ['egg', 'rice', 'pancit canton', 'corned beef', 'beef loaf'];
      const archived = new Set<string>();
      
      keyIngredients.forEach(ingredientName => {
        const product = allProducts.find((p: any) => {
          const name = (p.product_name || p.name || '').toLowerCase().trim();
          return name === ingredientName && p.status === 'archived';
        });
        if (product) {
          console.log('[orderpage] Found archived ingredient:', ingredientName, 'status:', product.status);
          archived.add(ingredientName);
        }
      });
      
      console.log('[orderpage] Archived ingredients:', Array.from(archived));
      setArchivedProducts(archived);
    } catch (err) {
      console.error('[orderpage] Failed to check archived ingredients:', err);
    }
  };
  
  // Check for archived key ingredients by fetching all products
  useEffect(() => {
    checkArchivedIngredients();
  }, []);
  
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setCategoriesLoading(true);
        const res = await api.get('/categories');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        type RawCategory = { id?: string | number; category_name?: string; name?: string };
        const mapped = data.map((c: RawCategory) => ({ id: String(c.id), label: c.category_name ?? c.name ?? `#${c.id}` }));
        // Sort categories to put Meals first
        const sorted = mapped.sort((a: {id: string; label: string}, b: {id: string; label: string}) => {
          if (a.label.toLowerCase() === 'meals') return -1;
          if (b.label.toLowerCase() === 'meals') return 1;
          return 0;
        });
        setCategories([{ id: 'all', label: 'All' }, ...sorted]);
      } catch (err) {
        console.debug('orderpage categories load failed', err);
        setCategories([{ id: 'all', label: 'All' }]);
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    };
    
    const loadBestSellers = async () => {
      try {
        setBestSellersLoading(true);
        const prodRes = await api.get('/products/best-sellers');
        if (!mounted) return;
        
        const data = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        
        // Set data immediately with backend stock info, sorted by total_sold (most sold first)
        const withImages = data.map((p: any) => ({
          ...p,
          image_url: p.image_url || (p.image ? `/storage/${p.image}` : null),
          // Use calculated_stock for bundles immediately
          stock: p.is_bundle ? (p.calculated_stock ?? 0) : (p.stock ?? 0),
        })).sort((a: any, b: any) => {
          // Sort by total_sold in descending order (most sold first)
          const aSold = a.total_sold ?? 0;
          const bSold = b.total_sold ?? 0;
          return bSold - aSold;
        });
        setBestSellers(withImages);
        setBestSellersLoading(false);
        
        // Load inventory in background to update stock if needed
        api.get('/inventories').then(invRes => {
          if (!mounted) return;
          const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
          const stockMap: Record<number, number> = {};
          for (const inv of invData) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          // Update with fresh inventory data and maintain order by total_sold
          const updated = withImages.map((p: any) => ({
            ...p,
            // Use calculated_stock for bundles, otherwise use inventory stock
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? p.stock ?? 0),
          })).sort((a: any, b: any) => {
            // Sort by total_sold in descending order (most sold first)
            const aSold = a.total_sold ?? 0;
            const bSold = b.total_sold ?? 0;
            return bSold - aSold;
          });
          setBestSellers(updated);
        }).catch(() => {});
        
      } catch (err) {
        console.debug('best sellers load failed', err);
        setBestSellers([]);
        setBestSellersLoading(false);
      }
    };
    
    const loadMeals = async () => {
      try {
        setMealsLoading(true);
        // Fetch products filtered by "Meals" category
        const prodRes = await api.get('/products');
        if (!mounted) return;
        
        const allProductsData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
        
        // Store all products for component lookup
        setAllProducts(allProductsData);
        
        // Filter for meals category
        const mealsData = allProductsData.filter((p: any) => {
          const category = typeof p.category === 'string' ? p.category : 
                          p.category?.category_name || p.category?.name || p.category_name || '';
          
          // Hide individual Corned Beef and Beef Loaf (only sold as part of combo meals)
          const productName = String(p.product_name ?? p.name ?? '').toLowerCase();
          if (productName === 'corned beef' || productName === 'beef loaf') {
            return false;
          }
          
          // Hide archived standalone products
          if (p.status === 'archived' && !p.is_bundle) {
            return false;
          }
          
          return category.toLowerCase() === 'meals';
        });
        
        // Set data with images and extract bundle components
        const bundleComps: Record<number, Array<{id: number, quantity: number}>> = {};
        const withImages = mealsData.map((p: any) => {
          // Extract bundle components
          if (p.is_bundle && p.bundle_items && Array.isArray(p.bundle_items)) {
            bundleComps[p.id] = p.bundle_items.map((item: any) => ({
              id: item.bundled_product?.id ?? item.bundled_product_id,
              quantity: item.quantity ?? 1
            }));
          }
          
          return {
            ...p,
            image_url: p.image_url || (p.image ? `/storage/${p.image}` : null),
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (p.stock ?? 0),
          };
        });
        setMealsBundleComponents(bundleComps);
        setMeals(withImages);
        setMealsLoading(false);
        
        // Load inventory in background
        api.get('/inventories').then(invRes => {
          if (!mounted) return;
          const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
          const stockMap: Record<number, number> = {};
          for (const inv of invData) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          // Update meals with inventory stock
          const updated = withImages.map((p: any) => ({
            ...p,
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? p.stock ?? 0),
          }));
          setMeals(updated);
          
          // Update ALL products with inventory stock for bundle component lookup
          const updatedAllProducts = allProductsData.map((p: any) => ({
            ...p,
            stock: p.is_bundle ? (p.calculated_stock ?? 0) : (stockMap[p.id] ?? p.stock ?? 0),
          }));
          setAllProducts(updatedAllProducts);
        }).catch(() => {});
        
      } catch (err) {
        console.debug('meals load failed', err);
        setMeals([]);
        setMealsLoading(false);
      }
    };
    
    load();
    loadBestSellers();
    loadMeals();
    
    // Listen for order placement event and refresh products/inventory
    const handleOrderPlaced = () => {
      console.debug('[Admin OrderPage] Order placed event received, refreshing products...');
      window.dispatchEvent(new CustomEvent('products:refresh'));
    };
    
    // Listen for category filter changes
    const handleCategoryChange = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const category = String(detail.category ?? 'all').trim();
      setActiveCategory(category === '' ? 'all' : category);
    };
    
    const handleProductsRefresh = () => {
      console.log('[orderpage] 🔄 Products refresh event - reloading meals');
      loadMeals();
      // Re-check archived ingredients
      checkArchivedIngredients();
    };
    
    window.addEventListener('order:placed', handleOrderPlaced as EventListener);
    window.addEventListener('products:filterCategory', handleCategoryChange as EventListener);
    window.addEventListener('products:refresh', handleProductsRefresh as EventListener);
    
    return () => {
      mounted = false;
      window.removeEventListener('order:placed', handleOrderPlaced as EventListener);
      window.removeEventListener('products:filterCategory', handleCategoryChange as EventListener);
      window.removeEventListener('products:refresh', handleProductsRefresh as EventListener);
    };
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  // NOTE: removed global 'orders:open' listener (order-now behavior reverted)

  return (
    <div className="relative">
      {/* Meta & Breadcrumb */}
      <PageMeta
        title="Order Management"
      />

      <div className="mb-6">
        <PageBreadcrumb
          pageTitle="Place Order"
        />
        <div className="max-w-3xl text-sm text-gray-600 dark:text-gray-400 mb-2">Create and manage orders easily add items to your cart, review and checkout.</div>
        {categoriesLoading ? (
          <div className="mt-6 mb-6">
            <div className="mb-4">
              <h3 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white/95 leading-snug">Categories</h3>
            </div>
            <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3 max-w-4xl">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : (
          <Category initialCategories={categories} />
        )}
        <hr />

        {/* Toolbar */}
        <div className="mt-6">
          {categoriesLoading ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-100 dark:border-gray-800 rounded-xl p-3 shadow-sm">
              <div className="relative w-full sm:w-[340px] h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              <div className="flex items-center gap-3 ml-auto w-full sm:w-auto justify-between sm:justify-end">
                <div className="hidden sm:flex sm:items-center sm:gap-3">
                  <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
                <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-gray-100 dark:border-gray-800 rounded-xl p-3 shadow-sm">
              <div className="relative w-full sm:w-[340px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 19l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                <input
                  onChange={(e) => {
                    const q = e.target.value ?? "";
                    window.dispatchEvent(new CustomEvent('products:search', { detail: { query: q } }));
                  }}
                  placeholder="Search products or it's categories..."
                  className="w-full pl-10 pr-3 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div className="flex items-center gap-3 ml-auto w-full sm:w-auto justify-between sm:justify-end">
                <div className="hidden sm:flex sm:items-center sm:gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{orders.reduce((s,o) => s + o.quantity, 0)} items</span>
                    <span className="text-sm text-gray-400">•</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-white">₱{orders.reduce((s, o) => s + (o.price * o.quantity), 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" onClick={() => toggleSidebar()} className="relative">
                    Review & Checkout
                    {orders.length > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {orders.length}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full space-y-6">
        {/* Best Sellers Section - Only show when All category is selected */}
        {activeCategory === 'all' && (
          <ComponentCard 
            title={bestSellersLoading ? (
              <div className="flex items-center justify-between w-full">
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span>🌟 Best Sellers</span>
                <span className="text-sm text-gray-400">Top selling products</span>
              </div>
            )} 
            className="w-full"
          >
            <div className="space-y-4">
              {bestSellersLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 animate-pulse">
                      <div className="h-40 bg-gray-200 dark:bg-gray-700"></div>
                      <div className="p-3 space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                          <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                        </div>
                        <div className="flex justify-center mt-2">
                          <div className="w-28 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : bestSellers.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {bestSellers.slice(bestSellersPage * itemsPerPage, (bestSellersPage + 1) * itemsPerPage).map((product: any) => {
                const imgUrl = product.image_url || (product.image ? `/storage/${product.image}` : null);
                return (
                  <div 
                    key={product.id} 
                    className="relative bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700 group"
                  >
                    <div className="relative h-40 overflow-hidden bg-gray-100 dark:bg-gray-700">
                      {imgUrl && (
                        <img 
                          src={imgUrl} 
                          alt={product.product_name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/product/product-06.jpg';
                          }}
                        />
                      )}
                      <span className="absolute top-2 left-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded">Best Seller</span>
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-base text-gray-900 dark:text-white truncate">{product.product_name || product.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{product.category?.category_name || product.category?.name || 'Uncategorized'}</p>
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-500 mb-1">₱{Number(product.price).toFixed(2)}</p>
                      {(product.is_stockable !== false && product.is_stockable !== 0) && !product.is_bundle ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Stock: {product.stock ?? 0}</p>
                      ) : null}
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <button
                          onClick={() => {
                            const isOutOfStock = typeof product.stock === 'number' && product.stock <= 0;
                            const defaultQty = isOutOfStock ? 0 : 1;
                            const currentQty = bestSellerQuantities[product.id] ?? defaultQty;
                            if (currentQty > (isOutOfStock ? 0 : 1)) {
                              setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty - 1 });
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={typeof product.stock === 'number' && product.stock <= 0 || (!bestSellerQuantities[product.id] || bestSellerQuantities[product.id] <= (typeof product.stock === 'number' && product.stock <= 0 ? 0 : 1))}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold text-gray-800 dark:text-white">
                          {typeof product.stock === 'number' && product.stock <= 0 
                            ? (bestSellerQuantities[product.id] ?? 0)
                            : (bestSellerQuantities[product.id] || 1)}
                        </span>
                        <button
                          onClick={() => {
                            const currentQty = bestSellerQuantities[product.id] ?? 1;
                            const maxQty = typeof product.stock === 'number' ? product.stock : 999;
                            
                            // For non-stockable items (not bundles), allow up to 999
                            if (!product.is_stockable && !product.is_bundle) {
                              setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty + 1 });
                            } else if (currentQty < maxQty) {
                              setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: currentQty + 1 });
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={
                            (!product.is_stockable && !product.is_bundle) 
                              ? false 
                              : (typeof product.stock === 'number' && ((bestSellerQuantities[product.id] ?? 1) >= product.stock))
                          }
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Cart Button */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => {
                            try {
                              const qty = bestSellerQuantities[product.id] || 1;
                              const item = {
                                id: product.id,
                                productName: product.product_name || product.name,
                                category: product.category?.category_name || product.category?.name || 'Uncategorized',
                                category_id: product.category_id || null,
                                price: Number(product.price) || 0,
                                image: product.image_url || (product.image ? `/storage/${product.image}` : null),
                                stock: typeof product.stock === 'number' ? product.stock : undefined,
                                is_bundle: product.is_bundle,
                                is_stockable: product.is_stockable,
                              };
                              // Add to order with the selected quantity
                              for (let i = 0; i < qty; i++) {
                                addToOrder(item);
                              }
                              // Reset quantity after adding
                              setBestSellerQuantities({ ...bestSellerQuantities, [product.id]: 1 });
                            } catch (err) {
                              console.error('Error adding product:', err);
                            }
                          }}
                          className="w-28 bg-brand-600 hover:bg-brand-700 text-white py-1.5 rounded-lg transition-colors flex items-center justify-center disabled:bg-[#f7a57d] disabled:cursor-not-allowed"
                          title={containsArchivedIngredient(product) ? "Ingredient unavailable" : "Add to order"}
                          disabled={(typeof product.stock === 'number' ? product.stock <= 0 : false) || containsArchivedIngredient(product)}
                        >
                          {containsArchivedIngredient(product) ? (
                            <span className="text-xs">Unavailable</span>
                          ) : (typeof product.stock === 'number' && product.stock <= 0 ? (
                            <span className="text-xs">Out of Stock</span>
                          ) : (
                            <ShoppingCart className="w-4 h-4" />
                          ))}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
                  </div>
                  
                  {/* Pagination Controls */}
                  {bestSellers.length > itemsPerPage && (
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setBestSellersPage(prev => Math.max(0, prev - 1))}
                        disabled={bestSellersPage === 0}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        ← Previous
                      </button>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Page {bestSellersPage + 1} of {Math.ceil(bestSellers.length / itemsPerPage)}
                      </div>
                      <button
                        onClick={() => setBestSellersPage(prev => Math.min(Math.ceil(bestSellers.length / itemsPerPage) - 1, prev + 1))}
                        disabled={bestSellersPage >= Math.ceil(bestSellers.length / itemsPerPage) - 1}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No best sellers available
                </div>
              )}
            </div>
          </ComponentCard>
        )}

        {/* Meals Section - Only show when All category is selected */}
        {activeCategory === 'all' && (
          <ComponentCard 
            title={
              <div className="flex items-center justify-between w-full">
                <span>🍽️ Meals</span>
                <span className="text-sm text-gray-400">Special meal offerings</span>
              </div>
            }
            className="w-full"
          >
            <div className="w-full">
              {mealsLoading ? (
                <div className="grid grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 animate-pulse">
                      <div className="h-40 bg-gray-200 dark:bg-gray-700"></div>
                      <div className="p-3 space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                          <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                        </div>
                        <div className="flex justify-center mt-2">
                          <div className="w-28 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : meals.length > 0 ? (
                <>
                  <div className="grid grid-cols-5 gap-4">
                    {meals.slice(mealsPage * itemsPerPage, (mealsPage + 1) * itemsPerPage).map((product: any) => {
                  const imgUrl = product.image_url || (product.image ? `/storage/${product.image}` : null);
                  const qty = mealsQuantities[product.id] || 1;
                  
                  // Handle bundle stock display with real-time cart calculation
                  const isNonStockable = product.is_stockable === false || product.is_stockable === 0;
                  const baseStock = typeof product.stock === 'number' ? product.stock : 999;
                  let displayStock = baseStock;
                  let isOutOfStock = false;
                  
                  if (product.is_bundle) {
                    // For bundles, calculate available stock based on components in real-time
                    const components = mealsBundleComponents[product.id];
                    if (components && components.length > 0) {
                      let minBundleStock = Infinity;
                      let hasStockableComponent = false;
                      
                      for (const comp of components) {
                        // Look up component in ALL products, not just meals
                        const compProduct = allProducts.find(p => p.id === comp.id);
                        if (compProduct) {
                          const compIsStockable = compProduct.is_stockable !== false && compProduct.is_stockable !== 0;
                          
                          if (compIsStockable) {
                            hasStockableComponent = true;
                            const compBaseStock = typeof compProduct.stock === 'number' ? compProduct.stock : 0;
                            const compAvailableStock = getMealAvailableStock(comp.id, compBaseStock);
                            const possibleBundles = Math.floor(compAvailableStock / comp.quantity);
                            minBundleStock = Math.min(minBundleStock, possibleBundles);
                          }
                          // Non-stockable components don't limit bundle quantity
                        }
                      }
                      
                      // If no stockable components found, treat bundle as having unlimited stock
                      displayStock = hasStockableComponent ? (minBundleStock === Infinity ? 0 : minBundleStock) : 999;
                    } else {
                      displayStock = product.calculated_stock ?? baseStock;
                    }
                    isOutOfStock = displayStock <= 0;
                  } else if (!isNonStockable) {
                    // For regular stockable items, use real-time available stock
                    displayStock = getMealAvailableStock(product.id, baseStock);
                    isOutOfStock = displayStock <= 0;
                  } else {
                    // For non-stockable items (like rice)
                    isOutOfStock = false;
                  }
                  
                  return (
                    <div 
                      key={product.id} 
                      className="relative bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700 group"
                    >
                      <div className="h-40 bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                        {imgUrl ? (
                          <img 
                            src={imgUrl} 
                            alt={product.product_name || product.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="text-gray-400 dark:text-gray-600">No image</div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <h4 className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 min-h-[2.5rem]">
                          {product.product_name || product.name}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {typeof product.category === 'string' ? product.category : product.category?.category_name || 'Uncategorized'}
                        </p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          ₱{Number(product.price || 0).toFixed(2)}
                        </p>
                        {product.status === 'archived' ? (
                          <p className="text-xs text-red-500 dark:text-red-400 font-semibold">Archived</p>
                        ) : containsArchivedIngredient(product) && product.is_bundle ? (
                          <p className="text-xs text-red-500 dark:text-red-400 font-semibold">Unavailable</p>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Stock: {product.is_bundle 
                              ? displayStock 
                              : (product.is_stockable === false || product.is_stockable === 0)
                                ? '∞' 
                                : (typeof product.stock === 'number' ? product.stock : '∞')
                            }
                          </p>
                        )}

                        <div className="flex items-center justify-center gap-2 mt-2">
                          <button
                            onClick={() => setMealsQuantities({ ...mealsQuantities, [product.id]: Math.max(1, qty - 1) })}
                            disabled={qty <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold text-gray-800 dark:text-white">{qty}</span>
                          <button
                            onClick={() => {
                              if (product.is_bundle) {
                                setMealsQuantities({ ...mealsQuantities, [product.id]: Math.min(displayStock, qty + 1) });
                              } else if (product.is_stockable === false || product.is_stockable === 0) {
                                setMealsQuantities({ ...mealsQuantities, [product.id]: qty + 1 });
                              } else {
                                const maxStock = typeof product.stock === 'number' ? product.stock : 999;
                                setMealsQuantities({ ...mealsQuantities, [product.id]: Math.min(maxStock, qty + 1) });
                              }
                            }}
                            disabled={product.is_bundle ? qty >= displayStock : (!isNonStockable && typeof product.stock === 'number' && qty >= product.stock)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex justify-center mt-2">
                          <button
                            onClick={() => {
                              try {
                                const item = {
                                  id: product.id,
                                  productName: String(product.product_name ?? product.name ?? ""),
                                  category: typeof product.category === 'string' ? product.category : product.category?.category_name ?? 'Uncategorized',
                                  category_id: product.category_id ?? null,
                                  price: Number(product.price || 0),
                                  image: product.image_url || (product.image ? `/storage/${product.image}` : null),
                                  stock: typeof product.stock === 'number' ? product.stock : undefined,
                                  is_bundle: product.is_bundle,
                                  is_stockable: product.is_stockable,
                                };
                                for (let i = 0; i < qty; i++) {
                                  addToOrder(item);
                                }
                                setMealsQuantities({ ...mealsQuantities, [product.id]: 1 });
                              } catch (err) {
                                console.error('Error adding product:', err);
                              }
                            }}
                            className="w-28 bg-brand-600 hover:bg-brand-700 text-white py-1.5 rounded-lg transition-colors flex items-center justify-center disabled:bg-[#f7a57d] disabled:cursor-not-allowed"
                            title={containsArchivedIngredient(product) ? "Ingredient unavailable" : "Add to order"}
                            disabled={isOutOfStock || containsArchivedIngredient(product)}
                          >
                            {containsArchivedIngredient(product) ? (
                              <span className="text-xs">Unavailable</span>
                            ) : (isOutOfStock ? (
                              <span className="text-xs">Out of Stock</span>
                            ) : (
                              <ShoppingCart className="w-4 h-4" />
                            ))}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                    })}
                  </div>
                  
                  {/* Pagination Controls */}
                  {meals.length > itemsPerPage && (
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setMealsPage(prev => Math.max(0, prev - 1))}
                        disabled={mealsPage === 0}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        ← Previous
                      </button>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Page {mealsPage + 1} of {Math.ceil(meals.length / itemsPerPage)}
                      </div>
                      <button
                        onClick={() => setMealsPage(prev => Math.min(Math.ceil(meals.length / itemsPerPage) - 1, prev + 1))}
                        disabled={mealsPage >= Math.ceil(meals.length / itemsPerPage) - 1}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No meals available
                </div>
              )}
            </div>
          </ComponentCard>
        )}
        
        {/* Available Products Section */}
        <ComponentCard title={categoriesLoading ? (
          <div className="flex items-center justify-between w-full">
            <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-56 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        ) : (
          <div className="flex items-center justify-between w-full"><span>Available Products</span><span className="text-sm text-gray-400">Browse and add items to your order</span></div>
        )} className="w-full">
          <div className="w-full">
            <ProductGrid />
          </div>
        </ComponentCard>
      </div>

      {/* Right Sidebar */}
      <AdminSelectedSidebar isOpen={isOpen} toggleSidebar={toggleSidebar} />
    </div>
  );
}
