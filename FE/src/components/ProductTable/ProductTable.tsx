import { useEffect, useState, useMemo, useRef } from "react";
  import Badge from "../ui/badge/Badge";
  import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getFilteredRowModel,
    ColumnDef,
    flexRender,
    SortingState,
  } from '@tanstack/react-table';
  // modal UI moved to separate components
  import AddStockModal from "../modals/AddStockModal";
  import EditProductModal from "../modals/EditProductModal";
  import DamageModal from "../modals/DamageModal";
  import {
    PlusIcon,
    PencilIcon,
    ArchiveIcon,
  } from "../../icons";
  import TableButton from "../ui/button/TableButton";

  import api from "../../lib/axios";
  import Swal from 'sweetalert2';
  import { useProductNotification } from "../../context/ProductNotificationContext";

  interface Product {
    id: number;
    name?: string;
    category?: string | { category_name?: string; name?: string };
    category_name?: string;
    image?: string;
    quantity?: number | string;
    price?: number | string;
    status?: string;
    
    [key: string]: any;
  }

  export default function ProductTable({ searchQuery = "" }: { searchQuery?: string }) {
      const { highlightedProductId, setHighlightedProductId } = useProductNotification();
      // helper to normalize various image values returned by backend
      const normalizeImage = (value: any): string | null => {
        if (!value && value !== 0) return null;
        const raw = String(value);
        let out: string | null = null;
        if (raw.startsWith('http') || raw.startsWith('//')) out = raw;
        else if (raw.startsWith('/')) out = raw;
        else if (raw.startsWith('storage/')) out = `/${raw}`;
        else out = `/storage/${raw}`;
        // Log mapping in dev to help diagnose missing images
        if (process.env.NODE_ENV !== 'production') console.debug('[normalizeImage] raw -> normalized', raw, '->', out);
        return out;
      };
    
    const [sorting, setSorting] = useState<SortingState>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const pageIndexBeforeRefreshRef = useRef(0);
    const isRefreshingRef = useRef(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]); // Store all products including archived
    const [inventories, setInventories] = useState<any[]>([]);
    const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
    const [stockQuantity, setStockQuantity] = useState<number | ''>('');
    const [stockSaving, setStockSaving] = useState(false);
    const [stockError, setStockError] = useState<string | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [editName, setEditName] = useState('');
    const [editPrice, setEditPrice] = useState<number | ''>('');
    const [editCategoryId, setEditCategoryId] = useState<number | ''>('');
    const [editStock, setEditStock] = useState<number | ''>('');
    const [editIsStockable, setEditIsStockable] = useState<boolean>(true);
    const [editImageFile, setEditImageFile] = useState<File | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editImageError, setEditImageError] = useState<string | null>(null);
    const [originalEditName, setOriginalEditName] = useState('');
    const [originalEditPrice, setOriginalEditPrice] = useState<number | ''>('');
    const [originalEditCategoryId, setOriginalEditCategoryId] = useState<number | ''>('');
    const [originalEditImageFile, setOriginalEditImageFile] = useState<File | null>(null);
    const [damageModalOpen, setDamageModalOpen] = useState(false);
    const [damageDamageCost, setDamageDamageCost] = useState<number | ''>('');
    const [damageDamageReason, setDamageDamageReason] = useState<string>('');
    const [damageDamageAction, setDamageDamageAction] = useState<string>('write_off');
    const [damageSaving, setDamageSaving] = useState(false);
    const [damageError, setDamageError] = useState<string | null>(null);
    const [categories, setCategories] = useState<Array<any>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failedImageIds, setFailedImageIds] = useState<Set<number>>(new Set());
    const [productsFetchedAt, setProductsFetchedAt] = useState<number>(Date.now());

    useEffect(() => {
      let mounted = true;
      const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
          console.time('[fetchData] total');

          // Fetch products first and render immediately to reduce perceived load time.
          console.time('[fetchData] products');
          const prodRes = await api.get('/products');
          console.timeEnd('[fetchData] products');

          if (!mounted) return;

          const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.data || [];
          // Store all products including archived ones (needed for checking bundle ingredients)
          setAllProducts(prodData);
          // Filter out only archived products (Corned beef and Beef loaf should be visible in admin table)
          const activeProducts = prodData.filter((p: any) => p.status !== 'archived');
          setProducts(activeProducts);
          console.debug('[fetchData] products count:', Array.isArray(activeProducts) ? activeProducts.length : (activeProducts?.data?.length ?? 'unknown'));
          // record a timestamp so we can bust image cache when products refresh
          setProductsFetchedAt(Date.now());

          // Stop the main loading spinner now that products are available.
          if (mounted) setLoading(false);

          // Fetch inventories asynchronously (don't block UI). When available,
          // update the inventories so stock numbers refresh in-place.
          api.get('/inventories')
            .then((invRes) => {
              if (!mounted) return;
              const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.data || [];
              setInventories(invData);
              console.debug('[fetchData] inventories count:', Array.isArray(invData) ? invData.length : (invData?.data?.length ?? 'unknown'));
              console.timeEnd('[fetchData] total');
            })
            .catch((invErr) => {
              console.warn('Failed to load inventories (non-blocking):', invErr?.message ?? invErr);
              console.timeEnd('[fetchData] total');
            });
        } catch (err: any) {
          console.timeEnd('[fetchData] total');
          setError(err?.response?.data?.message || err.message || 'Failed to load products');
          if (mounted) setLoading(false);
        }
      };

      // Initial fetch on component mount
      fetchData();

      // listen for manual refresh events (dispatched after adding a product)
      const onRefresh = () => {
        // Save current page index before refresh using the ref value (always current)
        isRefreshingRef.current = true;
        fetchData();
      };
      window.addEventListener('products:refresh', onRefresh as EventListener);
      return () => {
        mounted = false;
        window.removeEventListener('products:refresh', onRefresh as EventListener);
      };
    }, []);

    const closeModal = () => {
      setIsModalOpen(false);
      setStockModalProduct(null);
      setStockQuantity('');
      setStockError(null);
      setStockSaving(false);
    };

    const openAddStockModal = (product: Product) => {
      setStockModalProduct(product);
      setStockQuantity(0);
      setIsModalOpen(true);
    };

    const openEditModal = (product: Product) => {
      setEditProduct(product);
      setEditName(product.product_name || product.name || '');
      setOriginalEditName(product.product_name || product.name || '');
      setEditPrice(typeof product.price === 'number' ? product.price : (Number(product.price) || ''));
      setOriginalEditPrice(typeof product.price === 'number' ? product.price : (Number(product.price) || ''));
      // try to get category id if available
      setEditCategoryId(((product as any).category as any)?.id ?? (product as any).category_id ?? '');
      setOriginalEditCategoryId(((product as any).category as any)?.id ?? (product as any).category_id ?? '');
      // For edit modal we treat the stock field as the amount to reduce
      // (the user will enter how many units to remove). Default to 0.
      setEditStock(0);
      setEditIsStockable(product.is_stockable !== false && product.is_stockable !== 0);
      setEditImageFile(null);
      setOriginalEditImageFile(null);
      setEditError(null);
      setEditModalOpen(true);
    };

  

  

    const submitStock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stockModalProduct) return;
      const pid = stockModalProduct.id;
      const qty = Number(stockQuantity);
      if (isNaN(qty) || qty < 0) {
        setStockError('Quantity must be a non-negative number');
        return;
      }

      setStockSaving(true);
      setStockError(null);
      try {
        // Client-side validation for replacement image (if provided)
        if (editImageFile) {
          const allowedExt = ['.jpeg', '.jpg', '.png', '.gif'];
          const name = String(editImageFile.name || '').toLowerCase();
          const hasExt = allowedExt.some((ext) => name.endsWith(ext));
          const isImageType = String(editImageFile.type || '').startsWith('image/');
          // Accept the file if either the browser-provided MIME type indicates an image
          // OR the filename has a recognized image extension. Previously both were
          // required which rejected some valid files in certain environments.
          if (!(isImageType || hasExt)) {
            setEditError('The file must be an image. Allowed image types: jpeg, png, jpg, gif.');
            setEditSaving(false);
            return;
          }
        }
        await api.post('/inventories', { product_id: pid, quantity: qty });
        // refresh products/inventories
        window.dispatchEvent(new CustomEvent('products:refresh'));
        // brief success alert (auto-close) so user gets feedback without blocking
        try {
          await Swal.fire({
            title: 'Stock Updated',
            text: `Added ${qty} units to ${stockModalProduct?.product_name || stockModalProduct?.name || 'product'}`,
            icon: 'success',
            showConfirmButton: false,
            showCloseButton: false,
            timer: 1400,
            timerProgressBar: true,
            allowOutsideClick: true,
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
        } catch (e) {
          // ignore toast errors
        }
        closeModal();
      } catch (err: any) {
        setStockError(err?.response?.data?.message || err.message || 'Failed to add stock');
      } finally {
        setStockSaving(false);
      }
    };

    const closeEditModal = () => {
      setEditModalOpen(false);
      setEditProduct(null);
      setEditName('');
      setEditPrice('');
      setEditCategoryId('');
      setEditError(null);
      setEditSaving(false);
      setEditImageFile(null);
      setEditImageError(null);
    };

    // Helper: convert a File to a data URL (base64) string
    const fileToDataUrl = (file: File) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => {
          const result = reader.result as string | ArrayBuffer | null;
          if (typeof result === 'string') resolve(result);
          else reject(new Error('Unexpected file reader result'));
        };
        reader.readAsDataURL(file);
      });
    };

    // fetch categories for edit modal select
    useEffect(() => {
      let mounted = true;
      const loadCategories = async () => {
        try {
          const res = await api.get('/categories');
          const data = Array.isArray(res.data) ? res.data : res.data.data || [];
          if (!mounted) return;
          setCategories(data);
        } catch (err) {
          // ignore silently; categories are optional in UI
        }
      };
      loadCategories();
      return () => { mounted = false; };
    }, []);

    const submitEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editProduct) return;
      const id = editProduct.id;
      if (!editName || editName.toString().trim() === '') {
        setEditError('Product name is required');
        return;
      }
      if (editPrice === '' || isNaN(Number(editPrice))) {
        setEditError('Valid price is required');
        return;
      }
      if (editCategoryId === '' || editCategoryId === null) {
        setEditError('Category is required');
        return;
      }
      
      // Check for duplicate product name (excluding current product)
      try {
        const duplicateName = products.some((p: Product) => 
          p.id !== id && 
          p.name && 
          p.name.toLowerCase() === editName.toLowerCase()
        );
        
        if (duplicateName) {
          await Swal.fire({
            title: 'Product Already Exists',
            text: `A product with the name "${editName}" already exists. Please use a different name.`,
            icon: 'error',
            confirmButtonText: 'OK',
            confirmButtonColor: '#ef4444',
            allowOutsideClick: true,
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
          return;
        }
      } catch (err) {
        console.error('Failed to check for duplicate names:', err);
        // If check fails, allow user to proceed (backend will validate)
      }
      
      setEditSaving(true);
      setEditError(null);
      setEditImageError(null);
      try {
        // handle stock adjustments first
        // Note: editStock is the amount to REDUCE from current stock (not the desired total)
        const currentStock = inventories.reduce((acc, inv) => {
          const iPid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
          if (iPid != null && Number(iPid) === Number(id)) {
            return acc + (Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0);
          }
          return acc;
        }, 0);

        const reduceBy = editStock === '' ? 0 : Number(editStock);
        if (isNaN(reduceBy) || reduceBy < 0) {
          throw new Error('Reduction amount must be a non-negative number');
        }

        if (reduceBy > 0) {
          if (reduceBy > currentStock) {
            throw new Error('Cannot decrease stock: reduction exceeds current stock');
          }

          // Reduce across inventory records (oldest-first) until reduction satisfied
          let remaining = reduceBy;
          const invs = inventories
            .filter((inv) => {
              const iPid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
              return iPid != null && Number(iPid) === Number(id);
            })
            .sort((a, b) => (a.id || 0) - (b.id || 0)); // oldest-first

          if (invs.length === 0) {
            throw new Error('Cannot decrease stock: no inventory records to adjust');
          }

          

          // compute final total and status once, include status on each inventory update
          const finalTotal = currentStock - reduceBy;
          const status = finalTotal > 10 ? 'in_stock' : finalTotal > 0 ? 'low_stock' : 'out_of_stock';

          for (const inv of invs) {
            if (remaining <= 0) break;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (qty <= 0) continue;
            const take = Math.min(qty, remaining);
            const newQty = qty - take;
            // perform update for this inventory row and include status (required by backend)
            await api.put(`/inventories/${inv.id}`, { product_id: id, quantity: newQty, status });
            remaining -= take;
          }

          if (remaining > 0) {
            throw new Error('Failed to fully reduce stock (unexpected)');
          }


        }

        // Client-side validation for replacement image to avoid server-side 422
        if (editImageFile) {
          const maxSize = 25 * 1024 * 1024; // 25MB
          if (editImageFile.size && editImageFile.size > maxSize) {
            setEditError('Image is too large — maximum allowed size is 25 MB.');
            setEditSaving(false);
            return;
          }
        }
        // now update product fields (name, price, category) and status
        // compute resulting total after any reduction
        const finalTotal = currentStock - (reduceBy || 0);
        const status = finalTotal > 10 ? 'in_stock' : finalTotal > 0 ? 'low_stock' : 'out_of_stock';

        const form = new FormData();
        form.append('product_name', String(editName));
        form.append('price', String(editPrice));
        if (editImageFile) {
          console.log('[submitEdit] Uploading image:', {
            name: editImageFile.name,
            size: editImageFile.size,
            type: editImageFile.type
          });
          form.append('image', editImageFile);
        }
        form.append('category_id', String(editCategoryId));
        
        form.append('status', status);
        form.append('_method', 'PUT');
        await api.post(`/products/${id}`, form);

        // refresh product list
        window.dispatchEvent(new CustomEvent('products:refresh'));
        closeEditModal();
        try {
          await Swal.fire({
            title: 'Product Updated',
            text: `${editName || 'Product'} was updated successfully.`,
            icon: 'success',
            showConfirmButton: false,
            showCloseButton: false,
            timer: 1400,
            timerProgressBar: true,
            allowOutsideClick: true,
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
        } catch (e) { /* ignore */ }
      } catch (err: any) {
        // Normalize error messages, handle validation (422) clearly
        const resp = err?.response;
        // If server indicates upload failure caused by PHP temp-file issues, try base64 fallback
        if (resp && resp.status === 422 && editImageFile) {
          // Normalize server payload: sometimes PHP warnings/html are injected before JSON
          let data: any = resp.data || {};
          if (typeof data === 'string') {
            const idx = data.indexOf('{');
            if (idx !== -1) {
              try { data = JSON.parse(data.substring(idx)); } catch { data = {}; }
            } else { data = {}; }
          }
          const imgErr = data?.errors?.image ? String(Array.isArray(data.errors.image) ? data.errors.image.join('; ') : data.errors.image) : '';
          const serverMsg = String(data?.message || '');
          const needsFallback = imgErr.toLowerCase().includes('failed to upload') || imgErr.toLowerCase().includes('temporary') || serverMsg.toLowerCase().includes('failed to upload');
          if (needsFallback) {
            try {
              const dataUrl = await fileToDataUrl(editImageFile);
              // Recompute status for the fallback payload using current inventories and requested reduction
              const currentStockFallback = inventories.reduce((acc, inv) => {
                const iPid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
                if (iPid != null && Number(iPid) === Number(id)) {
                  return acc + (Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0);
                }
                return acc;
              }, 0);
              const reduceByFallback = editStock === '' ? 0 : Number(editStock);
              const finalTotalFallback = currentStockFallback - (reduceByFallback || 0);
              const statusFallback = finalTotalFallback > 10 ? 'in_stock' : finalTotalFallback > 0 ? 'low_stock' : 'out_of_stock';

              const payload: any = {
                product_name: String(editName),
                price: String(editPrice),
                category_id: String(editCategoryId),
                
                status: statusFallback,
                image_base64: dataUrl,
                _method: 'PUT'
              };
              await api.post(`/products/${id}`, payload);
              window.dispatchEvent(new CustomEvent('products:refresh'));
              closeEditModal();
              try {
                await Swal.fire({
                  title: 'Product Updated',
                  text: `${editName || 'Product'} was updated successfully.`,
                  icon: 'success',
                  showConfirmButton: false,
                  showCloseButton: false,
                  timer: 1400,
                  timerProgressBar: true,
                  allowOutsideClick: true,
                  willOpen: () => {
                    const container = document.querySelector('.swal2-container') as HTMLElement | null;
                    if (container) container.style.zIndex = '300000';
                  }
                });
              } catch (e) { /* ignore */ }
              return;
            } catch (fallbackErr) {
              console.warn('Base64 fallback failed:', fallbackErr);
              // fall through to regular 422 handling
            }
          }
        }
        if (resp && resp.status === 422) {
          if (process.env.NODE_ENV !== 'production') console.debug('[submitEdit] validation error payload:', resp.data);
          const data = resp.data;
          // Laravel-style validation errors usually come in data.errors
          if (data && typeof data === 'object') {
            if (data.errors && typeof data.errors === 'object') {
              // If the server included a per-field image error, surface that separately
              if (data.errors.image) {
                const imgMsg = Array.isArray(data.errors.image) ? data.errors.image.join('; ') : String(data.errors.image);
                setEditImageError(imgMsg);
                // also set the general edit error if other fields exist
                const other = { ...data.errors };
                delete other.image;
                const otherMsgs = Object.values(other).flat().join('; ');
                if (otherMsgs) setEditError(otherMsgs);
              } else {
                const msgs = Object.values(data.errors).flat().join('; ');
                setEditError(msgs);
              }
            } else if (data.message) {
              setEditError(String(data.message));
            } else {
              // fallback to stringify the validation payload for clarity
              setEditError(JSON.stringify(data));
            }
          } else {
            setEditError(String(data ?? err.message ?? 'Validation failed'));
          }
        } else {
          if (process.env.NODE_ENV !== 'production') console.debug('[submitEdit] error response:', resp?.data ?? err);
          const serverErrors = err?.response?.data?.errors;
          if (serverErrors && typeof serverErrors === 'object') {
            if (serverErrors.image) {
              const imgMsg = Array.isArray(serverErrors.image) ? serverErrors.image.join('; ') : String(serverErrors.image);
              setEditImageError(imgMsg);
              const other = { ...serverErrors };
              delete other.image;
              const otherMsgs = Object.values(other).flat().join('; ');
              if (otherMsgs) setEditError(otherMsgs);
            } else {
              const msgs = Object.values(serverErrors).flat().join('; ');
              setEditError(msgs);
            }
          } else {
            setEditError(err?.response?.data?.message || err.message || String(err));
          }
        }
      } finally {
        setEditSaving(false);
      }
    };

    const submitDamage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editProduct) return;
      
      setDamageError(null);
      setDamageSaving(true);

      try {
        const damageQty = editStock === '' ? 0 : Number(editStock);
        if (damageQty <= 0) {
          setDamageError('Quantity must be greater than 0');
          setDamageSaving(false);
          return;
        }

        if (!damageDamageReason.trim()) {
          setDamageError('Damage reason is required');
          setDamageSaving(false);
          return;
        }

        // First: Reduce inventory
        const id = editProduct.id;
        const currentStock = inventories.reduce((acc, inv) => {
          const iPid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
          if (iPid != null && Number(iPid) === Number(id)) {
            return acc + (Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0);
          }
          return acc;
        }, 0);

        if (damageQty > currentStock) {
          throw new Error('Cannot record damage: reduction exceeds current stock');
        }

        // Reduce across inventory records (oldest-first) until reduction satisfied
        let remaining = damageQty;
        const invs = inventories
          .filter((inv) => {
            const iPid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            return iPid != null && Number(iPid) === Number(id);
          })
          .sort((a, b) => (a.id || 0) - (b.id || 0)); // oldest-first

        if (invs.length === 0) {
          throw new Error('Cannot record damage: no inventory records to adjust');
        }

        // Update inventory records
        const finalTotal = currentStock - damageQty;
        const status = finalTotal > 10 ? 'in_stock' : finalTotal > 0 ? 'low_stock' : 'out_of_stock';

        for (const inv of invs) {
          if (remaining <= 0) break;
          const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
          if (qty <= 0) continue;
          const take = Math.min(qty, remaining);
          const newQty = qty - take;
          await api.put(`/inventories/${inv.id}`, { product_id: id, quantity: newQty, status });
          remaining -= take;
        }

        if (remaining > 0) {
          throw new Error('Failed to fully reduce stock (unexpected)');
        }

        // Second: Record damage
        const costPerUnit = damageDamageCost !== '' ? Number(damageDamageCost) : (typeof editPrice === 'number' ? editPrice : Number(editPrice) || 0);

        await api.post('/damages', {
          product_id: editProduct.id,
          quantity: damageQty,
          cost_per_unit: costPerUnit,
          reason: damageDamageReason,
          action_taken: damageDamageAction,
        });

        // Success - show alert and close modal
        await Swal.fire({
          title: 'Damage Recorded',
          text: `${damageQty} unit(s) recorded as damaged with total cost: ₱${(costPerUnit * damageQty).toFixed(2)}`,
          icon: 'success',
          confirmButtonColor: '#3b82f6',
          didOpen: () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            if (container) container.style.zIndex = '300000';
          }
        });

        // Reset damage modal
        setDamageModalOpen(false);
        setDamageDamageReason('');
        setDamageDamageCost('');
        setDamageDamageAction('write_off');
        setDamageSaving(false);
        
        // Close edit modal too
        closeEditModal();
        
        // Refresh products
        window.dispatchEvent(new CustomEvent('products:refresh'));
      } catch (err: any) {
        console.error('[submitDamage] error:', err);
        const message = err?.response?.data?.message || err?.message || 'Failed to record damage';
        setDamageError(String(message));
        setDamageSaving(false);
      }
    };

    const handleArchiveProduct = async (product: Product) => {
      try {
        const result = await Swal.fire({
          title: 'Archive Product?',
          text: `Are you sure you want to archive "${product.product_name || product.name}"? You can unarchive it later.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Archive',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#dc2626',
          willOpen: () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            if (container) container.style.zIndex = '200000';
          }
        });

        if (!result.isConfirmed) return;

        await api.patch(`/products/${product.id}/archive`);
        
        // Refresh products list
        window.dispatchEvent(new CustomEvent('products:refresh'));
        
        try {
          await Swal.fire({
            title: 'Archived',
            text: `"${product.product_name || product.name}" has been archived successfully.`,
            icon: 'success',
            showConfirmButton: false,
            showCloseButton: false,
            timer: 1400,
            timerProgressBar: true,
            allowOutsideClick: true,
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
        } catch (e) {
          // ignore
        }
      } catch (err: any) {
        try {
          await Swal.fire({
            title: 'Error',
            text: err?.response?.data?.message || err.message || 'Failed to archive product',
            icon: 'error',
            willOpen: () => {
              const container = document.querySelector('.swal2-container') as HTMLElement | null;
              if (container) container.style.zIndex = '200000';
            }
          });
        } catch (e) {
          // ignore
        }
      }
    };

    // Pagination is now handled by TanStack Table

    // clear any recorded failed images when products refresh so images
    // will be retried (useful after server-side fixes like recreating storage link)
    useEffect(() => {
      setFailedImageIds(new Set());
    }, [products]);

    // If an image previously failed (recorded in failedImageIds), retry
    // after a short delay. This helps when server-side fixes (symlink)
    // make images available again shortly after the component marked
    // them as failed.
    useEffect(() => {
      if (failedImageIds.size === 0) return;
      const id = setTimeout(() => setFailedImageIds(new Set()), 3000);
      return () => clearTimeout(id);
    }, [failedImageIds]);

    // Column definitions for TanStack Table
    const columns = useMemo<ColumnDef<Product>[]>(() => [
      {
        accessorKey: 'product_name',
        header: 'Products',
        cell: ({ row }) => {
          const product = row.original;
          let img: string | null = null;
          if (product.image_url) img = normalizeImage(product.image_url);
          else if (product.image) img = normalizeImage(product.image);
          else if (product.image_path) img = normalizeImage(product.image_path);
          
          const name = product.product_name || product.name || product.productName || product.title || '—';
          const category = typeof product.category === 'string'
            ? product.category
            : product.category?.category_name || product.category_name || '—';
          
          return (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative overflow-hidden rounded-full border-2 border-gray-300 dark:border-gray-600">
                <div className="absolute inset-0 w-full h-full bg-gray-100 dark:bg-gray-800" aria-hidden="true" style={{ zIndex: 0 }} />
                <img
                  key={`product-img-${product.id}-${String(img)}-${productsFetchedAt}`}
                  width={40}
                  height={40}
                  loading="lazy"
                  src={
                    img && !failedImageIds.has(Number(product.id))
                      ? `${img}${img.includes('?') ? '&' : '?'}v=${productsFetchedAt}&_t=${Math.random()}`
                      : '/images/product/product-06.jpg'
                  }
                  alt={name}
                  className="w-full h-full object-cover"
                  style={{ zIndex: 1, position: 'relative' }}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.onerror = null;
                    setFailedImageIds((s) => new Set(Array.from(s).concat([Number(product.id)])));
                    el.src = '/images/product/product-06.jpg';
                  }}
                />
              </div>
              <div>
                <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {name}
                </span>
                <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                  {category}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: 'Stocks',
        cell: ({ row }) => {
          const product = row.original;
          if (product.is_bundle || product.is_stockable === false || product.is_stockable === 0) {
            return '-';
          }
          
          const stockMap: Record<number, number> = {};
          for (const inv of inventories) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          const computedStock = product.id ? stockMap[Number(product.id)] ?? null : null;
          return computedStock != null ? computedStock : (product.quantity ?? product.stock ?? '-');
        },
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => {
          const price = row.original.price;
          if (price == null) return '-';
          if (typeof price === 'number') return `₱${price}`;
          const s = String(price).trim();
          return s.startsWith('₱') ? s : `₱${s}`;
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const product = row.original;
          const stockMap: Record<number, number> = {};
          for (const inv of inventories) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          const computedStock = product.id ? stockMap[Number(product.id)] ?? null : null;
          const quantity = computedStock != null ? computedStock : (product.quantity ?? product.stock ?? '-');
          
          // Check if bundle contains archived ingredients
          const hasArchivedIngredient = product.is_bundle && product.bundle_items && Array.isArray(product.bundle_items) 
            ? product.bundle_items.some((item: any) => {
                // Check status from bundle_items directly
                if (item.status === 'archived') return true;
                // Also check the bundledProduct object if it exists
                if (item.bundled_product && item.bundled_product.status === 'archived') return true;
                // Check by product name in allProducts (includes archived products)
                const ingredientName = (item.product_name || item.bundled_product?.product_name || '').toLowerCase();
                const fullProduct = allProducts.find((p: any) => 
                  (p.product_name || p.name || '').toLowerCase() === ingredientName
                );
                if (fullProduct && fullProduct.status === 'archived') return true;
                return false;
              })
            : false;
          
          const mapStatus = (rawStatus: any, qty: number | string, isStockable: any, isBundle: boolean, hasArchived: boolean) => {
            // Check if bundle has archived ingredients first
            if (isBundle && hasArchived) {
              return 'Unavailable';
            }
            if (isStockable === false || isStockable === 0) {
              return 'On Stock';
            }
            if (rawStatus != null) {
              const s = String(rawStatus).toLowerCase();
              if (s.includes('arch')) return 'Archived';
            }
            const n = Number(qty);
            if (!Number.isNaN(n)) {
              if (n > 10) return 'On Stock';
              if (n > 0) return 'Low Stock';
              return 'Out of Stock';
            }
            if (rawStatus != null) {
              const s = String(rawStatus).toLowerCase();
              if (s.includes('active') || s.includes('in_stock') || s.includes('on-stock') || s.includes('on stock') || s === 'on_stock') return 'On Stock';
              if (s.includes('low') || s.includes('low_stock') || s.includes('low-stock')) return 'Low Stock';
              if (s.includes('out') || s.includes('out_of_stock') || s.includes('out-stock')) return 'Out of Stock';
            }
            return 'Out of Stock';
          };
          
          const status = mapStatus(product.status, quantity, product.is_stockable, product.is_bundle, hasArchivedIngredient);
          
          return (
            <Badge
              size="sm"
              color={
                status === 'On Stock' ? 'success' : 
                status === 'Low Stock' ? 'warning' : 
                status === 'Unavailable' ? 'error' : 
                'error'
              }
            >
              {status}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => {
          const product = row.original;
          
          // Calculate stock for this product
          const stockMap: Record<number, number> = {};
          for (const inv of inventories) {
            const pid = inv.product_id ?? inv.product?.id ?? inv.productId ?? null;
            const qty = Number(inv.quantity ?? inv.qty ?? inv.amount ?? 0) || 0;
            if (pid != null) stockMap[Number(pid)] = (stockMap[Number(pid)] || 0) + qty;
          }
          
          const computedStock = product.id ? stockMap[Number(product.id)] ?? null : null;
          const currentStock = computedStock != null ? computedStock : (product.quantity ?? product.stock ?? 0);
          const hasStock = Number(currentStock) > 0;
          
          return (
            <div className="flex gap-1 justify-center">
              <TableButton
                tooltip={product.is_stockable === false ? "Non-stockable item" : "Add Stock"}
                ariaLabel="Add stock"
                onClick={() => openAddStockModal(product)}
                bgClass={product.is_stockable === false ? "bg-gray-300 cursor-not-allowed" : "bg-blue-400 hover:bg-blue-500"}
                disabled={product.is_stockable === false}
              >
                <PlusIcon className="w-4 h-4" />
              </TableButton>
              <TableButton
                tooltip="Edit"
                ariaLabel="Edit"
                onClick={() => openEditModal(product)}
                bgClass="bg-yellow-400 hover:bg-yellow-500"
              >
                <PencilIcon className="w-4 h-4" />
              </TableButton>
              {!product.is_bundle && (
                <TableButton
                  tooltip={hasStock ? "Archive (must clear stock first)" : "Archive"}
                  ariaLabel="Archive"
                  onClick={() => handleArchiveProduct(product)}
                  bgClass={hasStock ? "bg-gray-300 cursor-not-allowed" : "bg-red-400 hover:bg-red-500"}
                  disabled={hasStock}
                >
                  <ArchiveIcon className="w-4 h-4" />
                </TableButton>
              )}
            </div>
          );
        },
      },
    ], [inventories, productsFetchedAt, failedImageIds]);

    // TanStack Table instance
    const table = useReactTable({
      data: products,
      columns,
      state: {
        sorting,
        globalFilter: searchQuery,
        pagination: {
          pageIndex: currentPageIndex,
          pageSize: 6,
        },
      },
      onSortingChange: setSorting,
      onGlobalFilterChange: () => {}, // Search is controlled by parent
      onPaginationChange: (updater) => {
        const newState = typeof updater === 'function' ? updater({ pageIndex: currentPageIndex, pageSize: 6 }) : updater;
        setCurrentPageIndex(newState.pageIndex);
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      globalFilterFn: (row, _columnId, filterValue) => {
        const product = row.original;
        const name = (product.product_name || product.name || "").toLowerCase();
        const category = typeof product.category === 'string' 
          ? product.category.toLowerCase()
          : (product.category?.category_name || product.category?.name || "").toLowerCase();
        const query = String(filterValue || "").toLowerCase();
        return name.includes(query) || category.includes(query);
      },
    });

    // Keep a stable ref to the table instance so we don't need to include
    // the whole `table` object in effect dependency arrays (it changes
    // identity each render). Use the ref when we need to call instance
    // methods inside effects.
    const tableRef = useRef<any>(table);
    useEffect(() => { tableRef.current = table; }, [table]);

    // Handle highlighting product from notification
    useEffect(() => {
      // Use the stable table ref to avoid effect re-runs caused by the
      // `table` object's changing identity. This effect runs when the
      // highlighted product or product list changes.
      if (highlightedProductId && products.length > 0 && tableRef.current) {
        // Find the product index to calculate which page it's on
        const productIndex = products.findIndex(p => Number(p.id) === highlightedProductId);
        if (productIndex !== -1) {
          const pageSize = tableRef.current.getState().pagination.pageSize;
          const pageIndex = Math.floor(productIndex / pageSize);
          tableRef.current.setPageIndex(pageIndex);

          // Scroll to the highlighted row after a short delay to ensure it's rendered
          setTimeout(() => {
            const highlightedRow = document.querySelector(`[data-product-id="${highlightedProductId}"]`);
            if (highlightedRow) {
              highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            // Clear the highlight after showing it
            setTimeout(() => {
              setHighlightedProductId(null);
            }, 2000);
          }, 100);
        }
      }
    }, [highlightedProductId, products, setHighlightedProductId]);

    // Keep pageIndexBeforeRefreshRef in sync with currentPageIndex
    useEffect(() => {
      pageIndexBeforeRefreshRef.current = currentPageIndex;
    }, [currentPageIndex]);

    // Restore page index after products refresh
    useEffect(() => {
      if (isRefreshingRef.current && pageIndexBeforeRefreshRef.current > 0 && products.length > 0) {
        // Restore to the saved page after refresh
        setCurrentPageIndex(pageIndexBeforeRefreshRef.current);
        isRefreshingRef.current = false;
      }
    }, [products]);

    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[1102px]">
            <table className="min-w-full">
              {/* Table Header */}
              <thead className="border-b border-gray-100 dark:border-white/[0.05]">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header, idx) => (
                      <th
                        key={header.id}
                        className={`px-5 py-3 font-medium text-gray-500 text-theme-xs dark:text-gray-400 cursor-pointer select-none ${
                          idx === 0 ? 'text-start' : 'text-center'
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className={`flex items-center gap-2 ${idx === 0 ? 'justify-start' : 'justify-center'}`}>
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

              {/* Table Body */}
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {loading && (
                  <>
                    {[...Array(5)].map((_, i) => (
                      <tr key={i}>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-3 animate-pulse">
                            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div className="space-y-2 flex-1">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex gap-2">
                            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {error && !loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center text-red-500">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading && products.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center">
                      No products found.
                    </td>
                  </tr>
                )}

                {table.getRowModel().rows.map(row => {
                  const product = row.original;
                  return (
                    <tr 
                      key={row.id}
                      data-product-id={product.id}
                      className={`transition-colors duration-500 hover:bg-gray-50 dark:hover:bg-white/[0.02] ${
                        highlightedProductId === Number(product.id) ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''
                      }`}
                    >
                      {row.getVisibleCells().map((cell, idx) => (
                        <td 
                          key={cell.id} 
                          className={`px-4 py-3 text-gray-500 text-theme-sm dark:text-gray-400 ${
                            idx === 0 ? 'text-start' : 'text-center'
                          }`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pagination controls */}
        {loading ? (
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 dark:border-white/[0.04]">
            <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-8 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 dark:border-white/[0.04]">
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
                  className={`px-3 py-1 rounded text-sm ${
                    idx === table.getState().pagination.pageIndex ? 'bg-blue-500 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
                  }`}
                >{idx + 1}</button>
              ))}
              <button
                className="px-3 py-1 rounded bg-white border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >Next</button>
            </div>
          </div>
        )}
        <AddStockModal
          isOpen={isModalOpen}
          onClose={closeModal}
          product={stockModalProduct}
          quantity={stockQuantity}
          setQuantity={setStockQuantity}
          onSubmit={submitStock}
          saving={stockSaving}
          error={stockError}
        />

        <EditProductModal
          isOpen={editModalOpen}
          onClose={closeEditModal}
          name={editName}
          setName={setEditName}
          price={editPrice}
          setPrice={setEditPrice}
          categoryId={editCategoryId}
          setCategoryId={setEditCategoryId}
          categories={categories}
          stock={editStock}
          setStock={setEditStock}
          isStockable={editIsStockable}
          imageFile={editImageFile}
          imageError={editImageError}
          setImageFile={setEditImageFile}
          onSubmit={submitEdit}
          saving={editSaving}
          error={editError}
          originalName={originalEditName}
          originalPrice={originalEditPrice}
          originalCategoryId={originalEditCategoryId}
          originalImageFile={originalEditImageFile}
          onRecordDamage={() => {
            setEditModalOpen(false);
            setDamageModalOpen(true);
          }}
        />

        <DamageModal
          isOpen={damageModalOpen}
          onClose={() => setDamageModalOpen(false)}
          productName={editProduct?.product_name || editProduct?.name || ''}
          productPrice={editPrice}
          quantity={editStock === '' ? 0 : Number(editStock)}
          reason={damageDamageReason}
          setReason={setDamageDamageReason}
          action={damageDamageAction}
          setAction={setDamageDamageAction}
          damageCost={damageDamageCost}
          setDamageCost={setDamageDamageCost}
          onSubmit={submitDamage}
          saving={damageSaving}
          error={damageError}
        />

        
      </div>
    );
  }
