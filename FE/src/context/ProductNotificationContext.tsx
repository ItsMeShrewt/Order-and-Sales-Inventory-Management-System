import { createContext, useContext, useState, ReactNode } from 'react';

interface ProductNotificationContextType {
  highlightedProductId: number | null;
  setHighlightedProductId: (id: number | null) => void;
}

const ProductNotificationContext = createContext<ProductNotificationContextType | undefined>(undefined);

export function ProductNotificationProvider({ children }: { children: ReactNode }) {
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);

  return (
    <ProductNotificationContext.Provider value={{ highlightedProductId, setHighlightedProductId }}>
      {children}
    </ProductNotificationContext.Provider>
  );
}

export function useProductNotification() {
  const context = useContext(ProductNotificationContext);
  if (!context) {
    throw new Error('useProductNotification must be used within ProductNotificationProvider');
  }
  return context;
}
