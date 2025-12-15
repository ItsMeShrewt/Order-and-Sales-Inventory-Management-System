import React from 'react';
import { Modal } from "../ui/modal";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import FileInput from "../form/input/FileInput";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  setName: (s: string) => void;
  price: number | '';
  setPrice: (v: number | '') => void;
  categoryId: number | '';
  setCategoryId: (v: number | '') => void;
  categories: any[];
  stock: number | '';
  setStock: (v: number | '') => void;
  isStockable?: boolean;
  imageFile?: File | null;
  setImageFile?: (f: File | null) => void;
  imageError?: string | null;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  originalName?: string;
  originalPrice?: number | '';
  originalCategoryId?: number | '';
  originalImageFile?: File | null;
  onRecordDamage?: () => void;
}

export default function EditProductModal({ isOpen, onClose, name, setName, price, setPrice, categoryId, setCategoryId, categories, stock, setStock, isStockable = true, imageFile, setImageFile, imageError, onSubmit, saving, error, originalName = '', originalPrice = '', originalCategoryId = '', originalImageFile = null, onRecordDamage }: Props) {
  const hasChanges = name !== originalName || price !== originalPrice || categoryId !== originalCategoryId || imageFile !== originalImageFile || stock !== '';
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[700px] m-4">
      <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
        <div className="px-2 pr-14">
          <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            Edit Product
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
            Update product details below.
          </p>
        </div>
        <form className="flex flex-col" onSubmit={onSubmit}>
          <div className="px-2 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
              <div>
                <Label>Product Name</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={categoryId === '' ? '' : String(categoryId)}
                  onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Select category</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.category_name || c.name || c.category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  value={price === '' ? '' : String(price)}
                  onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  min={"0"}
                />
              </div>

              <div>
                <Label>Reduce Quantity</Label>
                <Input
                  type="number"
                  value={stock === '' ? '' : String(stock)}
                  onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))}
                  min={"0"}
                  disabled={!isStockable}
                />
                <p className="mt-1 text-xs text-gray-500">{isStockable ? 'Enter how many units to remove from stock. Use the Add Stock button to increase stock.' : 'This product does not track stock.'}</p>
              </div>

              {stock !== '' && Number(stock) > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={onRecordDamage}
                    className="w-full px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                  >
                    Record as Damaged
                  </button>
                  <p className="mt-1 text-xs text-gray-500">Click to open the damage report form</p>
                </div>
              )}



              <div>
                <Label>Replace Image</Label>
                <FileInput onChange={async (e) => {
                  if (!e.target.files) return;
                  const f = e.target.files[0] ?? null;
                  if (typeof setImageFile === 'function') {
                    console.log('[EditProductModal] Selected file:', {
                      name: f?.name,
                      type: f?.type,
                      size: f?.size
                    });
                    setImageFile(f);
                  }
                }} />
                {imageFile && (
                  <p className="mt-1 text-xs text-gray-500">Selected file: {imageFile.name}</p>
                )}
                {imageError && (
                  <p className="mt-1 text-xs text-red-500">{imageError}</p>
                )}
              </div>

              

            </div>
          </div>
          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={saving || !hasChanges}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-500 px-4 mt-2">{error}</p>
          )}
        </form>
      </div>
    </Modal>
  );
}
