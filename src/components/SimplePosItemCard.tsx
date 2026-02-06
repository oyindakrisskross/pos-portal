// src/components/SimplePosItemCard.tsx

import { useState } from "react";
import type { AddToCartPayload, POSItem } from "../types/catalog";
import { formatMoney, parseDecimal } from "../helpers/posHelpers";

interface SimplePosItemCardProps {
  item: POSItem;
  onAddToCart: (payload: AddToCartPayload) => void;
  onClickItem?: (item: POSItem) => void;
}

export const SimplePosItemCard: React.FC<SimplePosItemCardProps> = ({
  item,
  onAddToCart,
  onClickItem,
}) => {
  const [imageError, setImageError] = useState(false);
  const stockQty = parseDecimal(item.stock_qty, 0);
  const price = parseDecimal(item.price, 0);
  const isOutOfStock = item.inventory_tracking && stockQty <= 0;
  const imageSrc = !imageError ? (item.primary_image ?? item.group_primary_image ?? null) : null;
  const hasImage = Boolean(imageSrc);

  const handleClick = () => {
    if (isOutOfStock) return;
    if (onClickItem) {
      onClickItem(item);
      return;
    }

    onAddToCart({
      item,
      quantity: 1,        
      customizations: [],
    });
  };

  return (
    <button
      type="button"
      disabled={isOutOfStock}
      title={isOutOfStock ? "Out of stock" : undefined}
      className={`flex flex-col rounded-lg border border-kk-border bg-kk-pri-bg p-3 text-left shadow-sm transition ${
        isOutOfStock ? "cursor-not-allowed opacity-60" : "hover:shadow-md"
      }`}
      onClick={handleClick}
    >
      {/* Image placeholder */}
      <div className={`mb-2 flex h-28 w-full items-center justify-center rounded-lg 
                      ${hasImage ? "bg-kk-sec-bg" : "bg-transparent"} text-[11px] text-kk-ter-text overflow-hidden`}>
        {hasImage ? (
          <img
            src={imageSrc}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="px-2 text-center text-[20px] font-bold text-kk-pri-text line-clamp-3">
            {item.name}
          </span>
        )}
      </div>

      {/* Name + stock */}
      <div className="mb-1 flex items-center justify-between gap-1">
        {hasImage ? (
          <span className="line-clamp-2 text-[13px] font-medium text-kk-pri-text">
            {item.name}
          </span>
        ) : (
          <span />
        )}
        { item.inventory_tracking && stockQty > 0 && (
          <span className="text-[10px] text-kk-hover">In stock</span>
        )}

        { item.inventory_tracking && stockQty === 0 && (
          <span className="text-[10px] text-kk-err">Out</span>
        )} 
      </div>

      {/* Optional description */}
      {/* {item.description && (
        <div className="mb-2 line-clamp-2 text-[11px] text-gray-500">
          {item.description}
        </div>
      )} */}

      {/* Price row */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[14px] font-semibold text-kk-acc">
          {/* ₦{price.toFixed(0)} */}
          {formatMoney(price)}
        </span>

        {/* “Custom” pill placeholder (you can gate this on item.customized later) */}
        {item.customized && (
          <span className="rounded-full border border-kk-border-strong 
              px-3 py-[2px] text-[10px] text-kk-sec-text">
            Custom
          </span>
        )} 
      </div>
    </button>
  );
};
