import React from 'react';
import { Printer } from 'lucide-react';

interface OrderItem {
  productName: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface OrderReceiptProps {
  orderNumber: string;
  pcNumber: string;
  items: OrderItem[];
  total: number;
  orderDate: string;
  onPrint?: () => void;
  showPrintButton?: boolean;
}

const OrderReceipt: React.FC<OrderReceiptProps> = ({
  orderNumber,
  pcNumber,
  items,
  total,
  orderDate,
  onPrint,
  showPrintButton = true
}) => {

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 w-[420px] mx-auto border-2 border-gray-300 dark:border-gray-600 shadow-2xl" id="order-receipt">
      {/* Logo and Header */}
      <div className="mb-6 pb-3 border-b-2 border-solid border-gray-400 dark:border-gray-700 flex flex-col items-center gap-3">
        <img 
          src="/images/logo/MKB.jpg" 
          alt="MKB Logo" 
          style={{ height: '60px', width: '60px' }}
          className="object-contain"
        />
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-widest">MKB</h1>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">SALES RECEIPT</p>
      </div>

      {/* Header - Station/Type and Date */}
      <div className="mb-6 pb-4 border-b border-solid border-gray-300 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-xs mb-3">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Station:</span>
            <span className="text-gray-900 dark:text-white font-bold">{pcNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Date:</span>
            <span className="text-gray-900 dark:text-white font-bold">{orderDate}</span>
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400 font-medium">Order #:</span>
          <span className="text-gray-900 dark:text-white font-bold">{orderNumber}</span>
        </div>
      </div>

      {/* Items List */}
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-4 pb-3 mb-4 border-b border-gray-200 dark:border-gray-700 items-end">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">Product</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 text-right">Amount</span>
        </div>
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="space-y-1">
              <div className="grid grid-cols-2 gap-4 items-center">
                <p className="text-gray-900 dark:text-white font-semibold text-sm leading-tight">
                  {item.productName}
                </p>
                <span className="text-gray-900 dark:text-white font-bold text-sm tabular-nums text-right">
                  ₱{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {item.quantity} × item
              </p>
              {item.notes && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                  {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Total Section */}
      <div className={`border-t-2 border-solid border-gray-400 dark:border-gray-700 pt-2 ${showPrintButton ? 'mb-6' : 'mb-0'}`}>
        <div className="flex justify-between items-center">
          <span className="text-base font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200">Total Amount</span>
          <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">₱{total.toFixed(2)}</span>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-4 pt-2 border-t border-dashed border-gray-300 dark:border-gray-700 text-center">
        <p className="text-[8px] text-gray-600 dark:text-gray-400">Thank you for your purchase</p>
      </div>

      {/* Print Button */}
      {showPrintButton && onPrint && (
        <button
          onClick={onPrint}
          className="w-full bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-bold py-3.5 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg hover:shadow-xl uppercase tracking-wide text-sm mt-6 print:hidden"
        >
          <Printer className="w-5 h-5" />
          Print Receipt
        </button>
      )}
    </div>
  );
};

export default OrderReceipt;
