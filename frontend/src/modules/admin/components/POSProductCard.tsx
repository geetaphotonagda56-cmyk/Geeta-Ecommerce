import { useEffect, useState } from 'react';
import { Product } from '../../../services/api/admin/adminProductService';

interface POSProductCardProps {
  product: Product;
  qtyInCart: number;
  orderType: 'Retail' | 'Wholesale';
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  onQuantityChange: (qty: number) => void;
}

export default function POSProductCard({
  product,
  qtyInCart,
  orderType,
  onAdd,
  onIncrease,
  onDecrease,
  onQuantityChange,
}: POSProductCardProps) {
  const [qtyInput, setQtyInput] = useState(String(qtyInCart));

  useEffect(() => {
    setQtyInput(String(qtyInCart));
  }, [qtyInCart]);

  const commitQtyInput = () => {
    const parsed = parseInt(qtyInput, 10);
    if (Number.isNaN(parsed)) {
      setQtyInput(String(qtyInCart));
      return;
    }
    onQuantityChange(parsed);
  };

  const sellingPrice =
    orderType === 'Wholesale' && product.wholesalePrice ? product.wholesalePrice : product.price;
  const mrp = product.compareAtPrice || 0;
  const outOfStock = product.stock <= 0;
  const atStockLimit = qtyInCart >= product.stock;

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col ${
        outOfStock ? 'opacity-60 grayscale' : ''
      }`}
    >
      <div className="w-full h-24 md:h-28 bg-gray-50 flex items-center justify-center overflow-hidden">
        {product.mainImage ? (
          <img src={product.mainImage} alt="" className="w-full h-full object-contain" loading="lazy" decoding="async" />
        ) : (
          <span className="text-lg font-bold text-gray-300">
            {(product.productName || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="p-2 flex-1 flex flex-col gap-1">
        <h4 className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight min-h-[2rem]">
          {product.productName}
        </h4>

        <span
          className={`self-start px-1.5 py-0.5 rounded text-[10px] font-bold ${
            outOfStock
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-[var(--primary-alpha-10)] text-[var(--primary-darker)] border border-teal-100'
          }`}
        >
          {outOfStock ? 'Out of Stock' : `Stock: ${product.stock}`}
        </span>

        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-[var(--primary-color)]">₹{sellingPrice}</span>
          {mrp > sellingPrice && (
            <span className="text-[10px] text-gray-400 line-through">₹{mrp}</span>
          )}
        </div>

        <div className="mt-auto pt-1">
          {qtyInCart === 0 ? (
            <button
              onClick={onAdd}
              disabled={outOfStock}
              className={`w-full h-9 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                outOfStock
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)]'
              }`}
            >
              Add
            </button>
          ) : (
            <div className="flex items-center justify-between gap-1 bg-[var(--primary-color)]/10 rounded-lg p-1">
              <button
                onClick={onDecrease}
                aria-label="Decrease quantity"
                className="w-10 h-10 flex items-center justify-center rounded-md bg-[var(--primary-color)] text-white text-xl font-black hover:bg-[var(--primary-dark)] transition-colors"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onBlur={commitQtyInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                onClick={(e) => e.currentTarget.select()}
                aria-label="Quantity"
                className="flex-1 min-w-0 text-center text-sm font-black text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={onIncrease}
                disabled={atStockLimit}
                aria-label="Increase quantity"
                className={`w-10 h-10 flex items-center justify-center rounded-md text-xl font-black transition-colors ${
                  atStockLimit
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)]'
                }`}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
