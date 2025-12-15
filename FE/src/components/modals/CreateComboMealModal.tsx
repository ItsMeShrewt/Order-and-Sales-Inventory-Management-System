import { useEffect, useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import api from '../../lib/axios';
import Swal from 'sweetalert2';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Product {
  id: number;
  product_name: string;
  price: number;
  stock?: number;
  category?: { category_name?: string };
}

interface SelectedProduct {
  product_id: number;
  product_name: string;
  quantity: number;
}

export default function CreateComboMealModal({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealsCategoryId, setMealsCategoryId] = useState<string>('1');
  const [existingCombos, setExistingCombos] = useState<Array<{name: string; productIds: number[]}>>([]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const fetchData = async () => {
      if (mounted) setLoading(true);
      try {
        // Fetch categories to get Meals category ID
        const catRes = await api.get('/categories');
        const categories = Array.isArray(catRes.data) ? catRes.data : catRes.data.data || [];
        const mealsCategory = categories.find((c: any) => 
          (c.category_name || c.name || '').toLowerCase() === 'meals'
        );
        
        let mealsCatId = '1'; // default fallback
        if (mealsCategory) {
          mealsCatId = String(mealsCategory.id);
          if (mounted) setMealsCategoryId(mealsCatId);
        }

        // Fetch products
        const productsRes = await api.get('/products');
        const allProducts = Array.isArray(productsRes.data) ? productsRes.data : productsRes.data.data || [];
        
        // Get existing combo combinations
        const combos: Array<{name: string; productIds: number[]}> = [];
        allProducts.forEach((product: any) => {
          if (product.is_bundle && product.bundle_items && Array.isArray(product.bundle_items)) {
            const productIds = product.bundle_items
              .map((item: any) => item.bundled_product_id || item.product_id)
              .filter((id: any) => id != null)
              .map((id: any) => Number(id))
              .sort();
            combos.push({
              name: product.product_name,
              productIds: productIds
            });
          }
        });
        if (mounted) setExistingCombos(combos);
        
        // Filter for Meals category only, exclude archived and existing bundles (but keep already used products to show warning)
        if (mounted) setProducts(allProducts.filter((p: any) => {
          const prodCategoryId = typeof p.category === 'object' 
            ? String(p.category?.id || p.category_id || '')
            : String(p.category_id || '');
          return prodCategoryId === mealsCatId
            && p.status !== 'archived' 
            && !p.is_bundle;
        }));
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => { mounted = false; };
  }, [isOpen]);

  const handleProductSelect = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const exists = selectedProducts.find(p => p.product_id === productId);
    
    if (exists) {
      // Unselect the product
      setSelectedProducts(selectedProducts.filter(p => p.product_id !== productId));
    } else {
      // Select the product
      setSelectedProducts([...selectedProducts, {
        product_id: product.id,
        product_name: product.product_name,
        quantity: 1
      }]);
    }
  };



  const generateComboName = () => {
    if (selectedProducts.length === 0) return '';
    return selectedProducts.map(p => p.product_name).join(' & ');
  };

  const handleSubmit = async () => {
    if (selectedProducts.length < 2) {
      setError('Please select at least 2 products to create a combo meal');
      return;
    }

    if (!price || Number(price) <= 0) {
      setError('Please enter a valid price');
      return;
    }

    // Check if this exact combination already exists
    const selectedProductIds = selectedProducts.map(p => p.product_id).sort();
    const duplicate = existingCombos.find(combo => {
      if (combo.productIds.length !== selectedProductIds.length) return false;
      return combo.productIds.every((id, index) => id === selectedProductIds[index]);
    });

    if (duplicate) {
      Swal.fire({
        title: 'Combo Already Exists',
        html: `This combination already exists as: <strong>${duplicate.name}</strong>`,
        icon: 'warning',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-lg',
          title: 'text-lg font-semibold',
          htmlContainer: 'text-sm'
        },
        willOpen: () => {
          const container = document.querySelector('.swal2-container') as HTMLElement | null;
          if (container) container.style.zIndex = '99999';
        }
      });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const comboName = generateComboName();
      
      // Get CSRF token first
      try {
        await api.get('/sanctum/csrf-cookie');
      } catch (csrfErr) {
        console.warn('CSRF cookie fetch warning (may not be needed):', csrfErr);
      }
      
      // Create the combo product
      const productData = new FormData();
      productData.append('product_name', comboName);
      productData.append('price', price);
      productData.append('category_id', mealsCategoryId); // Use Meals category
      productData.append('status', 'out_of_stock'); // Default status
      productData.append('is_stockable', '0'); // Combo meals don't have their own stock

      console.log('Creating combo product:', { comboName, price, mealsCategoryId, selectedProducts });
      const productRes = await api.post('/products', productData);
      console.log('Product response:', productRes.data);
      
      const comboProductId = productRes.data.id || productRes.data.product?.id;
      if (!comboProductId) {
        throw new Error('Failed to get combo product ID from response');
      }
      console.log('Combo product created with ID:', comboProductId);

      // Create bundle relationships
      console.log('Creating bundle relationships for:', selectedProducts);
      const bundlePromises = selectedProducts.map(item => {
        console.log('Creating bundle item:', { product_id: comboProductId, bundled_product_id: item.product_id, quantity: item.quantity });
        return api.post('/bundle-products', {
          product_id: comboProductId,
          bundled_product_id: item.product_id,
          quantity: item.quantity
        });
      });
      
      await Promise.all(bundlePromises);

      console.log('Combo meal created successfully');
      
      onSuccess();
      resetForm();
      onClose();

      // Show success message after modal closes
      setTimeout(() => {
        Swal.fire({
          title: 'Combo Meal Created!',
          html: `<strong>${comboName}</strong> has been created successfully<br/><small class="text-gray-500">Price: ₱${Number(price).toFixed(2)}</small>`,
          icon: 'success',
          timer: 2500,
          timerProgressBar: true,
          showConfirmButton: false,
          showCloseButton: false,
          allowOutsideClick: true,
          customClass: {
            popup: 'rounded-lg',
            title: 'text-lg font-semibold',
            htmlContainer: 'text-sm'
          },
          willOpen: () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            if (container) container.style.zIndex = '99999';
          }
        });
      }, 300);
    } catch (e: any) {
      console.error('Error creating combo meal:', e);
      const errorMsg = e?.response?.data?.message || e?.response?.data?.error || e.message || 'Failed to create combo meal';
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedProducts([]);
    setPrice('');
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-white dark:bg-gray-900">
          <h3 className="text-lg font-semibold">Create Combo Meal</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Select meal products to bundle together (e.g., Egg & Rice, Corned Beef & Rice)
          </p>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Product Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Meal Products (minimum 2)
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {products.length === 0 && !loading && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No meal products available. Please add meal products first.
                    </p>
                  )}
                  <div className="space-y-2">
                    {products.map(product => {
                      const isSelected = selectedProducts.some(p => p.product_id === product.id);
                      
                      return (
                        <div key={product.id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleProductSelect(product.id)}
                              className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm">{product.product_name}</div>
                              <div className="text-xs text-gray-500">
                                ₱{Number(product.price).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Generated Combo Name Preview */}
              {selectedProducts.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <label className="block text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                    Combo Name (Auto-generated)
                  </label>
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    {generateComboName()}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Contains: {selectedProducts.map(p => p.product_name).join(', ')}
                  </div>
                </div>
              )}

              {/* Price Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Combo Price (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Enter combo meal price"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white dark:bg-gray-900 flex justify-end gap-2">
          <Button
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="bg-gray-500 hover:bg-gray-600 text-white"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || selectedProducts.length < 2}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            {saving ? 'Creating...' : 'Create Combo Meal'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
