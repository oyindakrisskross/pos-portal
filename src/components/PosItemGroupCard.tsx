// src/components/PosItemGroupCard.tsx

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
  const prices = items.map((i) => parseDecimal(i.price, 0));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const stockQty = items.reduce(
    (acc, item) => acc + parseDecimal(item.stock_qty, 0),
    0
  );
  const isOutOfStock = inventoryTracking && stockQty <= 0;

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
      <div className="mb-2 flex h-28 w-full items-center justify-center rounded-lg bg-kk-sec-bg text-[11px] text-kk-ter-text">
        <span>No Image</span>
      </div>

      {/* Name + stock */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="line-clamp-2 text-[13px] font-medium text-kk-pri-text">
          {groupName}
        </span>
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
