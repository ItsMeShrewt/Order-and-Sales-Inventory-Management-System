import React from 'react';
import { Modal } from "../ui/modal";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: any | null;
  quantity: number | '';
  setQuantity: (v: number | '') => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
}

export default function AddStockModal({ isOpen, onClose, product, quantity, setQuantity, onSubmit, saving, error }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[700px] m-4">
      <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
        <div className="px-2 pr-14">
          <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            Add Stock
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
            Update your stock here to keep your inventory accurate and up-to-date
          </p>
        </div>
        <form className="flex flex-col" onSubmit={onSubmit}>
          <div className="px-2 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
              <div>
                <Label>Product Name</Label>
                <Input
                  type="text"
                  value={product ? (product.product_name || product.name || product.title || '') : ''}
                  onChange={() => {}}
                  disabled
                />
              </div>

              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={quantity === '' ? '' : String(quantity)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuantity(v === '' ? '' : Number(v));
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" type="submit" disabled={saving || quantity === '' || (typeof quantity === 'number' && quantity <= 0)}>
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
