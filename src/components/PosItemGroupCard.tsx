// src/components/PosItemGroupCard.tsx

import { useMemo, useState } from "react";
import type { POSItem } from "../types/catalog";
import { formatMoney, parseDecimal } from "../helpers/posHelpers";

interface PosItemGroupCardProps {
  groupName: string;
  items: POSItem[];
  inventoryTracking: boolean;
  onOpen: () => void;          // new: open the variants modal
}

export const PosItemGroupCard: React.FC<PosItemGroupCardProps> = ({
  groupName,
  items,
  inventoryTracking,
  onOpen,
}) => {
  const [imageError, setImageError] = useState(false);
  const prices = items.map((i) => parseDecimal(i.price, 0));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const stockQty = items.reduce(
    (acc, item) => acc + parseDecimal(item.stock_qty, 0),
    0
  );
  const isOutOfStock = inventoryTracking && stockQty <= 0;

  const imageSrc = useMemo(() => {
    if (imageError) return null;
    const fromGroup = items.find((i) => i.group_primary_image)?.group_primary_image ?? null;
    const fromAnyItem = items.find((i) => i.primary_image)?.primary_image ?? null;
    return fromGroup ?? fromAnyItem;
  }, [imageError, items]);
  const hasImage = Boolean(imageSrc);

  return (
    <button
      type="button"
      disabled={isOutOfStock}
      title={isOutOfStock ? "All variants are out of stock" : undefined}
      className={`flex flex-col rounded-lg border border-kk-border bg-kk-pri-bg p-3 text-left shadow-sm transition ${
        isOutOfStock ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md"
      }`}
      onClick={isOutOfStock ? undefined : onOpen}
    >
      {/* Image placeholder */}
      <div className={`mb-2 flex h-28 w-full items-center justify-center rounded-lg ${hasImage ? "bg-kk-sec-bg" : "bg-transparent"} text-[11px] text-kk-ter-text overflow-hidden`}>
        {hasImage ? (
          <img
            src={imageSrc || undefined}
            alt={groupName}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="px-2 text-center text-[20px] font-bold text-kk-pri-text line-clamp-3">
            {groupName}
          </span>
        )}
      </div>

      {/* Name + stock */}
      <div className="mb-1 flex items-center justify-between gap-1">
        {hasImage ? (
          <span className="line-clamp-2 text-[13px] font-medium text-kk-pri-text">
            {groupName}
          </span>
        ) : (
          <span />
        )}
        { inventoryTracking && stockQty > 0 && (
          <span className="text-[10px] text-kk-hover">In stock</span>
        )}

        { inventoryTracking && stockQty === 0 && (
          <span className="text-[10px] text-kk-err">Out</span>
        )} 
      </div>

      {/* Optional: show something from a sample variant */}
      {/* {items[0]?.description && (
        <div className="mb-2 line-clamp-2 text-[11px] text-gray-500">
          {items[0].description}
        </div>
      )} */}

      {/* Price range + “Variants” pill */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[14px] font-semibold text-kk-acc">
          {minPrice === maxPrice
            ? `${formatMoney(minPrice)}`
            : `${formatMoney(minPrice)} - ${formatMoney(maxPrice)}`}
        </span>

        <span className="rounded-full border border-kk-border-strong px-3 py-[2px] 
                          text-[10px] text-kk-sec-text">
          Variants
        </span>
      </div>
    </button>
  );
};
