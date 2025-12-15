import React, { useState, useEffect } from "react";
import Card from "../common/Card";
import { ShoppingCart, Plus, Minus } from "lucide-react";

interface ProductCardProps {
  product: {
    id: number;
    product_name?: string;
    name?: string;
    productName?: string;
    category?: string;
    category_label?: string;
    category_id?: string;
    category_name?: string;
    stock?: number;
    price?: number | string;
    image?: string | null;
    image_url?: string;
    is_bundle?: boolean;
    is_stockable?: boolean;
    [key: string]: any;
  };
  availableStock: number;
  onAddToCart: (productId: number, quantity: number, notes?: string) => void;
  initialQuantity?: number;
  showStock?: boolean;
  badge?: string | null;
  onImageError?: (productId: number) => void;
  isRiceUnavailable?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  availableStock,
  onAddToCart,
  initialQuantity = 1,
  showStock = true,
  badge = null,
  onImageError,
  isRiceUnavailable = false
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [notes, setNotes] = useState("");

  // Cap quantity when availableStock changes (e.g., items added to cart)
  useEffect(() => {
    const isNonStockable = product.is_stockable === false;
    
    if (!isNonStockable && !product.is_bundle) {
      // For stockable items, cap quantity at availableStock
      if (availableStock <= 0) {
        // If no stock available, set to 1 (disabled state will prevent adding)
        setQuantity(1);
      } else if (quantity > availableStock) {
        setQuantity(availableStock);
      }
    } else if (product.is_bundle) {
      // For bundles, cap quantity at availableStock
      if (availableStock <= 0) {
        setQuantity(1);
      } else if (quantity > availableStock) {
        setQuantity(availableStock);
      }
    }
  }, [availableStock, quantity, product.is_stockable, product.is_bundle]);

  const handleIncrement = () => {
    const isNonStockable = product.is_stockable === false;
    
    console.log(`[ProductCard] Increment: product=${product.product_name}, is_stockable=${product.is_stockable}, isNonStockable=${isNonStockable}, is_bundle=${product.is_bundle}, quantity=${quantity}, availableStock=${availableStock}`);
    
    // Prevent incrementing bundles and stockable items beyond available stock
    if (product.is_bundle) {
      if (quantity < availableStock) {
        setQuantity(quantity + 1);
      }
    } else if (isNonStockable) {
      setQuantity(quantity + 1);
    } else {
      // For stockable items, don't exceed available stock
      if (quantity < availableStock) {
        setQuantity(quantity + 1);
      }
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleAddToCart = () => {
    if ((product.is_stockable || product.is_bundle) && availableStock <= 0) {
      return;
    }
    onAddToCart(product.id, quantity, notes);
    setQuantity(1);
    setNotes("");
  };

  const isOutOfStock = (product.is_stockable || product.is_bundle) && availableStock <= 0;
  const isNonStockable = product.is_stockable === false;
  
  // Disable increment when quantity reaches available stock
  const shouldDisableIncrement = product.is_bundle 
    ? quantity >= availableStock 
    : (!isNonStockable && quantity >= availableStock);
  
  const isDisabled = isOutOfStock || isRiceUnavailable;
  
  console.log(`[ProductCard] ${product.product_name}: is_stockable=${product.is_stockable}, availableStock=${availableStock}, quantity=${quantity}, shouldDisableIncrement=${shouldDisableIncrement}`);
  
  const displayName = product.product_name ?? product.productName ?? product.name ?? "—";
  const displayCategory = product.category_label ?? product.category ?? 'Uncategorized';
  const displayPrice = Number(product.price || 0).toFixed(2);

  return (
    <Card className="relative group p-3 shadow-sm rounded-lg bg-gray-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full">
      {/* Product Image */}
      <div className="w-full aspect-square relative rounded-md overflow-hidden mb-3 flex-shrink-0" style={{ backgroundColor: '#f5f5f5' }}>
        <div className="absolute inset-0 w-full h-full" aria-hidden="true" style={{ backgroundColor: '#f5f5f5' }} />
        {product.image && (
          <img
            src={product.image}
            alt={displayName}
            className="absolute inset-0 h-full w-full object-cover rounded-md transform group-hover:scale-102 transition-transform duration-200"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.onerror = null;
              console.warn('ProductCard image failed to load:', el.src);
              if (onImageError) {
                onImageError(product.id);
              }
            }}
          />
        )}
        {badge && (
          <span className="absolute top-2 left-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded">
            {badge}
          </span>
        )}
      </div>

      {/* Product Info - fixed heights */}
      <div className="flex flex-col items-center flex-shrink-0 mb-2">
        <div className="h-12 flex items-center justify-center w-full">
          <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 text-center line-clamp-2">
            {displayName}
          </h4>
        </div>
        <div className="h-5 flex items-center justify-center w-full">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-center line-clamp-1">
            {displayCategory}
          </p>
        </div>
        <div className="h-5 flex items-center justify-center w-full">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-center line-clamp-1">
            ₱{displayPrice}
            {showStock && product.is_stockable && !product.is_bundle ? (
              ` | Stock: ${availableStock <= 0 ? 0 : availableStock}`
            ) : null}
          </p>
        </div>
      </div>

      {/* Spacer to push buttons to bottom */}
      <div className="flex-grow"></div>

      {/* Quantity Controls and Cart Button - always at bottom */}
      <div className="space-y-2 w-full flex-shrink-0">
        {/* Quantity Controls */}
        <div className="flex items-center justify-center gap-2 h-7">
          <button
            onClick={handleDecrement}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={quantity <= 1 || isDisabled}
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-10 text-center text-sm font-semibold text-gray-800 dark:text-white">
            {isDisabled ? 0 : quantity}
          </span>
          <button
            onClick={handleIncrement}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={shouldDisableIncrement || isDisabled}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={isDisabled}
          className="w-full h-9 flex items-center justify-center rounded-md font-medium text-sm transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
          style={{ backgroundColor: isDisabled ? '#93C5FD' : '#3B82F6' }}
          title={isRiceUnavailable ? "Ingredient unavailable" : (isOutOfStock ? "Out of stock" : "Add to cart")}
        >
          {isRiceUnavailable ? (
            <span className="text-xs font-semibold">Unavailable</span>
          ) : (isOutOfStock ? (
            <span className="text-xs font-semibold">Out of Stock</span>
          ) : (
            <ShoppingCart className="w-4 h-4" />
          ))}
        </button>
      </div>
    </Card>
  );
};

export default ProductCard;
