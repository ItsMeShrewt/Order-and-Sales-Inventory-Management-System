import React from 'react';
import { Modal } from "../ui/modal";
import Label from "../form/Label";
import Input from "../form/input/InputField";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productName?: string;
  productPrice?: number | '';
  quantity: number;
  reason: string;
  setReason: (v: string) => void;
  action: string;
  setAction: (v: string) => void;
  damageCost: number | '';
  setDamageCost: (v: number | '') => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
}

export default function DamageModal({
  isOpen,
  onClose,
  productName = '',
  productPrice = '',
  quantity,
  reason,
  setReason,
  action,
  setAction,
  damageCost,
  setDamageCost,
  onSubmit,
  saving,
  error
}: Props) {
  const estimatedCost = damageCost !== '' 
    ? Number(damageCost) * quantity
    : (typeof productPrice === 'number' ? productPrice : Number(productPrice) || 0) * quantity;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md m-4">
      <div className="relative w-full p-6 bg-white no-scrollbar rounded-3xl dark:bg-gray-900">
        <div className="mb-6">
          <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Record Damage
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Document damaged or defective items
          </p>
        </div>

        {/* Product Info Display */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Product</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{productName}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Quantity</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{quantity} units</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Unit Price</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">₱{(typeof productPrice === 'number' ? productPrice : Number(productPrice) || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Damage Reason */}
          <div>
            <Label>Damage Reason *</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Dropped, Expired, Defective, Broken Packaging"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Briefly describe what happened</p>
          </div>

          {/* Action Taken */}
          <div>
            <Label>Action Taken *</Label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="write_off">Write-Off (Salary Deduction)</option>
              <option value="return_to_supplier">Return to Supplier</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {action === 'write_off' 
                ? 'Cost will be deducted from employee salary'
                : 'Product will be returned to supplier'}
            </p>
          </div>

          {/* Price per Unit */}
          <div>
            <Label>Price per Unit</Label>
            <Input
              type="number"
              value={damageCost === '' ? '' : String(damageCost)}
              onChange={(e) => setDamageCost(e.target.value === '' ? '' : Number(e.target.value))}
              min="0"
              placeholder={String(typeof productPrice === 'number' ? productPrice : Number(productPrice) || 0)}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave blank to use product price</p>
          </div>

          {/* Estimated Total */}
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Total Cost</span>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">₱{estimatedCost.toFixed(2)}</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !reason.trim()}
              className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Recording...' : 'Record Damage'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
