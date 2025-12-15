import React, { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import ProductTable from "../../components/ProductTable/ProductTable";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import Label  from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Select from "../../components/form/Select";
import FileInput from "../../components/form/input/FileInput";
import CreateComboMealModal from "../../components/modals/CreateComboMealModal";
import api from "../../lib/axios";
import Swal from 'sweetalert2';

export default function Products() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const openArchivedModal = async () => {
    setIsArchivedModalOpen(true);
    setArchivedLoading(true);
    try {
      const res = await api.get('/products/archived');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      setArchivedProducts(data);
    } catch (err) {
      console.error('Failed to load archived products:', err);
      setArchivedProducts([]);
    } finally {
      setArchivedLoading(false);
    }
  };

  const closeArchivedModal = () => setIsArchivedModalOpen(false);

  // --- New: form state for Add Product ---
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(""); // will be category id as string
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isStockable, setIsStockable] = useState(true);
  
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveImageError, setSaveImageError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchCategories = async () => {
      try {
        setPageLoading(true);
        const res = await api.get('/categories');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        const opts = data.map((c: any) => ({ value: String(c.id), label: c.category_name || c.name || `#${c.id}` }));
        setCategories(opts);
      } catch (err) {
        // ignore for now; categories can be added manually
        setCategories([]);
      } finally {
        if (mounted) setPageLoading(false);
      }
    };
    fetchCategories();
    return () => { mounted = false; };
  }, []);

  const handleSelectChangeInternal = (value: string) => {
    setSelectedCategory(value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    // client-side validation: allowed types and max size (25MB)
    if (f) {
      console.log('[handleFileChange] File selected:', {
        name: f.name,
        type: f.type,
        size: f.size,
        sizeKB: (f.size / 1024).toFixed(2) + ' KB'
      });
      
      const allowedExt = ['.jpeg', '.jpg', '.png', '.gif', '.webp'];
      const name = String(f.name || '').toLowerCase();
      const hasExt = allowedExt.some((ext) => name.endsWith(ext));
      const isImageType = String(f.type || '').startsWith('image/');
      const maxSize = 25 * 1024 * 1024; // 25MB
      
      console.log('[handleFileChange] Validation:', {
        name,
        hasExt,
        isImageType,
        passesTypeCheck: isImageType || hasExt,
        size: f.size,
        maxSize,
        passesSizeCheck: f.size <= maxSize
      });
      
      if (!(isImageType || hasExt)) {
        console.error('[handleFileChange] Type validation failed');
        setSaveImageError('The file must be an image (jpeg, jpg, png, gif, webp).');
        setImageFile(null);
        return;
      }
      if (f.size && f.size > maxSize) {
        console.error('[handleFileChange] Size validation failed');
        setSaveImageError('Image is too large — maximum allowed size is 25 MB.');
        setImageFile(null);
        return;
      }
      
      console.log('[handleFileChange] Validation passed, file accepted');
    }
    setSaveImageError(null);
    setImageFile(f);
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

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    // prevent submit if we've flagged an image error client-side
    if (saveImageError) {
      setSaveError(saveImageError);
      return;
    }
    
    // Check for duplicate product name
    try {
      const res = await api.get('/products');
      const existingProducts = Array.isArray(res.data) ? res.data : res.data.data || [];
      const duplicateName = existingProducts.some((p: any) => 
        p.product_name && p.product_name.toLowerCase() === productName.toLowerCase()
      );
      
      if (duplicateName) {
        await Swal.fire({
          title: 'Product Already Exists',
          text: `A product with the name "${productName}" already exists. Please use a different name.`,
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
    
    setSaving(true);
    setSaveError(null);
    try {
      // optional: get CSRF cookie if using sanctum
      try { await api.get('/sanctum/csrf-cookie'); } catch (e) { /* ignore if not used */ }

      const form = new FormData();
      form.append('product_name', productName);
      form.append('price', price);
      
      form.append('category_id', selectedCategory);
      // default new products to no-stock state so they show as Out of Stock
      form.append('status', 'out_of_stock');
      form.append('is_stockable', isStockable ? '1' : '0');
      if (imageFile) form.append('image', imageFile);

      await api.post('/products', form);

      // success: close modal, reset form and notify ProductTable to refresh
      setProductName(''); setPrice(''); setSelectedCategory(''); setImageFile(null);
      setIsStockable(true);
      setSaveImageError(null);
      closeModal();
      window.dispatchEvent(new CustomEvent('products:refresh'));
      try {
        await Swal.fire({
          title: 'Product Added',
          text: `${productName || 'Product'} was added successfully.`,
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
      const resp = err?.response;
      // If upload failed because PHP couldn't create a temp file, try a base64 fallback.
      if (resp && resp.status === 422) {
        // Normalize server payload: sometimes PHP warnings are injected before JSON
        let data: any = resp.data || {};
        if (typeof data === 'string') {
          // try to extract JSON body inside the string
          const idx = data.indexOf('{');
          if (idx !== -1) {
            try {
              data = JSON.parse(data.substring(idx));
            } catch {
              data = {};
            }
          } else {
            data = {};
          }
        }
        const imgErr = data?.errors?.image ? String(Array.isArray(data.errors.image) ? data.errors.image.join('; ') : data.errors.image) : '';
        const serverMsg = String(data?.message || '');
        const needsFallback = imageFile && (imgErr.toLowerCase().includes('failed to upload') || imgErr.toLowerCase().includes('temporary') || serverMsg.toLowerCase().includes('failed to upload'));
        if (needsFallback) {
          try {
            // Convert image to data url and retry as JSON payload
            const dataUrl = await fileToDataUrl(imageFile!);
            const payload: any = {
              product_name: productName,
              price: price,
              category_id: selectedCategory,
              status: 'out_of_stock',
              is_stockable: isStockable,
              image_base64: dataUrl,
            };
            await api.post('/products', payload);

            // success: close modal, reset form and notify ProductTable to refresh
            setProductName(''); setPrice(''); setSelectedCategory(''); setImageFile(null);
            setIsStockable(true);
            setSaveImageError(null);
            closeModal();
            window.dispatchEvent(new CustomEvent('products:refresh'));
            try {
              await Swal.fire({
                title: 'Product Added',
                text: `${productName || 'Product'} was added successfully.`,
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
            return;
          } catch (fallbackErr: any) {
            // fallback failed; keep going to original handling
            console.warn('Base64 fallback failed:', fallbackErr);
          }
        }
      }

      if (resp && resp.status === 422) {
        const data = resp.data;
        if (data && data.errors && data.errors.image) {
          const imgMsg = Array.isArray(data.errors.image) ? data.errors.image.join('; ') : String(data.errors.image);
          setSaveImageError(imgMsg);
        }
        const msgs = data?.errors ? Object.values(data.errors).flat().join('; ') : data?.message;
        setSaveError(msgs || err.message || 'Failed to save product');
      } else {
        setSaveError(err?.response?.data?.message || err.message || 'Failed to save product');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProductsErrorBoundary>
      <>
      <PageMeta
        title="Products"
      />

      <PageBreadcrumb
        pageTitle="Products" />

      <div className="space-y-6">
        <ComponentCard
          title={
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 w-full">
              <span>Product List</span>
              {pageLoading ? (
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <Button size="xs" className="text-md" onClick={openArchivedModal} variant="outline">
                    📦 Archived
                  </Button>
                  <Button size="xs" className="text-md" onClick={() => setIsComboModalOpen(true)} variant="outline">
                    🍱 Create Combo Meal
                  </Button>
                  <Button size="xs" className="text-md" onClick={openModal}>
                    + Add Product
                  </Button>
                </div>
              )}
            </div>
          }
        >
          {/* Search bar */}
          {pageLoading ? (
            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
              <div className="relative w-full sm:w-[360px] h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            </div>
          ) : (
            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
              <div className="relative w-full sm:w-[360px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 19l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(String(e.target.value ?? ""))}
                  placeholder="Search products by name, category..."
                  className="w-full pl-10 pr-3 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            </div>
          )}

          <ProductTable searchQuery={searchQuery} />
        </ComponentCard>
      </div>

      {/* ✅ Modal for Adding Product */}
      <Modal isOpen={isModalOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Add New Product
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              Add a new product and update your stock here to keep your inventory accurate.
            </p>
          </div>

          <form className="flex flex-col" onSubmit={submitProduct}>
            <div className="px-2 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <Label>Product Name</Label>
                  <Input
                    type="text"
                    placeholder="Enter product name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>

                <div className="col-span-1">
                  <Label>Select Category</Label>
                  <Select
                    options={categories}
                    placeholder="Select a Category"
                    onChange={handleSelectChangeInternal}
                    className="dark:bg-dark-900"
                    defaultValue={selectedCategory}
                  />
                </div>

                <div>
                  <Label>Price</Label>
                  <Input
                    type="number"
                    placeholder="Enter price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>

                {/* Quantity removed: use Add Stock modal to manage inventory */}
                <div className="col-span-1">
                  <Label>Image</Label>
                  <FileInput onChange={handleFileChange} />
                  {saveImageError && <p className="mt-1 text-xs text-red-500">{saveImageError}</p>}
                </div>

                <div className="col-span-1 lg:col-span-2">
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isStockable}
                        onChange={(e) => setIsStockable(e.target.checked)}
                        className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <div className="flex-col">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Requires Inventory Tracking</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400"><br />Uncheck for unlimited items (e.g., Rice)</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Close
              </Button>
              <Button size="sm" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Product'}
              </Button>
            </div>
            {saveError && (
              <p className="text-sm text-red-500 px-4 mt-2">{saveError}</p>
            )}
          </form>
        </div>
      </Modal>

      {/* Archived Products Modal */}
      <Modal isOpen={isArchivedModalOpen} onClose={closeArchivedModal} className="max-w-6xl m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Archived Products
            </h4>
            
            {archivedLoading ? (
              <div className="flex justify-center items-center py-12">
                <p className="text-gray-500">Loading archived products...</p>
              </div>
            ) : archivedProducts.length === 0 ? (
              <div className="flex justify-center items-center py-12">
                <p className="text-gray-500">No archived products</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-600 dark:text-gray-400">
                  <thead className="text-xs font-semibold text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-3 text-left">Product Name</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Price</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedProducts.map((product: any) => (
                      <tr key={product.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{product.product_name || product.name}</td>
                        <td className="px-4 py-3">{typeof product.category === 'string' ? product.category : (product.category?.category_name || product.category?.name || '-')}</td>
                        <td className="px-4 py-3">₱{Number(product.price || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={async () => {
                              try {
                                await api.patch(`/products/${product.id}/unarchive`);
                                window.dispatchEvent(new CustomEvent('products:refresh'));
                                setArchivedProducts(archivedProducts.filter(p => p.id !== product.id));
                                try {
                                  await Swal.fire({
                                    title: 'Restored',
                                    text: `"${product.product_name || product.name}" has been restored.`,
                                    icon: 'success',
                                    showConfirmButton: false,
                                    timer: 1400,
                                    timerProgressBar: true,
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
                                    text: err?.response?.data?.message || 'Failed to restore product',
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
                            }}
                            className="px-3 py-1 text-sm font-medium text-white bg-green-500 rounded hover:bg-green-600 transition"
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Create Combo Meal Modal */}
      <CreateComboMealModal
        isOpen={isComboModalOpen}
        onClose={() => setIsComboModalOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent('products:refresh'));
        }}
      />
      </>
    </ProductsErrorBoundary>
  );
}

// Development ErrorBoundary for easier debugging of runtime errors on the Products page

class ProductsErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Products page error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-bold text-red-600">An error occurred rendering Products</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{String(this.state.error && (this.state.error.stack || this.state.error.message))}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

