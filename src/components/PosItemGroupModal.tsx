// src/components/PosItemGroupModal.tsx

import { useMemo, useState, useEffect } from "react";
import type {
  AddToCartPayload,
  CustomizationSelection,
  ItemCustomization,
  ItemGroupAttribute,
  POSItem,
} from "../types/catalog";
import { findVariantForSelection, formatMoney, parseDecimal } from "../helpers/posHelpers";

interface PosItemGroupModalProps {
  isOpen: boolean;
  groupName: string;
  items: POSItem[];
  onClose: () => void;
  onAddToCart: (payload: AddToCartPayload) => void;
}

export const PosItemGroupModal: React.FC<PosItemGroupModalProps> = ({
  isOpen,
  groupName,
  items,
  onClose,
  onAddToCart,
}) => {
  const [selectedOptions, setSelectedOptions] = 
    useState<Record<number, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [customizationQuantities, setCustomizationQuantities] = 
    useState<Record<number, number>>({});


  if (!isOpen || items.length === 0) return null;

  const sample = items[0];

  const groupAttributes: ItemGroupAttribute[] =
    sample.group_attributes && sample.group_attributes.length > 0
      ? sample.group_attributes
      : [];

  const hasCustomizations =
    !!sample.customized && !!sample.customizations?.length;

  // Find the matching variant for the currently selected options
  const selectedVariant = useMemo(
    () => findVariantForSelection(items, selectedOptions),
    [items, selectedOptions]
  );

  const effectiveItem: POSItem | null =
    selectedVariant || (groupAttributes.length === 0 ? sample : null);

  const price = effectiveItem ? parseDecimal(effectiveItem.price, 0) : 0;

  const allAttributesSelected =
    groupAttributes.length === 0 ||
    groupAttributes.every((attr) => selectedOptions[attr.id] != null);

  const stockQty =
    effectiveItem && effectiveItem.inventory_tracking
      ? parseDecimal(effectiveItem.stock_qty, 0)
      : null;
  const outOfStock = stockQty !== null && stockQty <= 0;
  const maxQty = stockQty !== null ? Math.max(0, Math.floor(stockQty)) : Infinity;

  const canAddToCart =
    !!effectiveItem && allAttributesSelected && !outOfStock && quantity <= maxQty;

  const handleAttributeChange = (attributeId: number, optionId: number) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [attributeId]: optionId,
    }));
  };

  const handleChangeQuantity = (delta: number) => {
    setQuantity((prev) => {
      const next = Math.max(1, prev + delta);
      if (Number.isFinite(maxQty)) {
        if (maxQty <= 0) return 1;
        return Math.min(next, maxQty);
      }
      return next;
    });
  };

  const handleCustomizationQtyChange = (
    customization: ItemCustomization,
    delta: number
  ) => {
    const step = parseDecimal(customization.step_qty, 1);
    const min = parseDecimal(customization.min_qty, 0);
    const max = parseDecimal(customization.max_qty, 99);

    setCustomizationQuantities((prev) => {
      const current = prev[customization.id] ?? min;
      let next = current + delta * step;
      if (Number.isNaN(next)) next = current;
      next = Math.max(min, Math.min(max, next));
      return { ...prev, [customization.id]: next };
    });
  };

  const totalCustomPriceDelta = useMemo(() => {
    if (!effectiveItem?.customizations) return 0;
    let total = 0;
    for (const c of effectiveItem.customizations) {
      const qty = customizationQuantities[c.id] ?? 0;
      if (qty > 0) {
        total += parseDecimal(c.price_delta, 0) * qty;
      }
    }
    return total;
  }, [effectiveItem, customizationQuantities]);

  const lineSubtotal = (price + totalCustomPriceDelta) * quantity;

  const handleAdd = () => {
    if (!effectiveItem) return;
    if (outOfStock) return;

    const selectedCustomizations: CustomizationSelection[] = [];
    if (hasCustomizations && effectiveItem.customizations) {
      for (const c of effectiveItem.customizations) {
        const qty = customizationQuantities[c.id];
        const min = parseDecimal(c.min_qty, 0);
        if (qty != null && qty > 0) {
          selectedCustomizations.push({
            customizationId: c.id,
            quantity: qty,
          });
        } else if (min > 0) {
          selectedCustomizations.push({
            customizationId: c.id,
            quantity: min,
          });
        }
      }
    }

    onAddToCart({
      item: effectiveItem,
      quantity,
      customizations: selectedCustomizations,
    });

    onClose();
  };

  // If modal closes / opens with a different group, reset selections
  useEffect(() => {
    if (!isOpen) {
      setSelectedOptions({});
      setQuantity(1);
      setCustomizationQuantities({});
    }
  }, [isOpen]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="w-full max-w-xl rounded-xl bg-kk-pri-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-2xl tracking-wide font-semibold text-kk-pri-text">
            {groupName}
          </h2>
          <button
            type="button"
            className="text-xl leading-none text-kk-ter-text hover:text-kk-pri-text 
                  transition cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-4 space-y-4">
          {/* Attribute groups & options (Period, Age, Class, etc.) */}
          {groupAttributes.length > 0 && (
            <div className="space-y-3">
              {groupAttributes.map((attr) => (
                <div key={attr.id}>
                  <div className="mb-1 text-base font-medium text-kk-pri-text">
                    {attr.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attr.options.map((opt) => {
                      const selected = selectedOptions[attr.id] === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`rounded-lg border px-6 py-3 text-base ${
                            selected
                              ? "border-kk-acc bg-kk-hover/10 text-kk-hover"
                              : "border-kk-border bg-kk-sec-bg text-kk-pri-text"
                          }`}
                          onClick={() =>
                            handleAttributeChange(attr.id, opt.id)
                          }
                        >
                          {opt.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* If a combination is invalid, let the cashier know */}
          {allAttributesSelected && !effectiveItem && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No variant exists for this combination. Please choose different
              options.
            </div>
          )}

          {/* Customizations (if any) */}
          {hasCustomizations && effectiveItem?.customizations && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-kk-pri-text">
                Add-ons
              </h3>
              <div className="space-y-2 rounded-lg border border-kk-border bg-kk-sec-bg p-2">
                {effectiveItem.customizations
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((c) => {
                    const qty = customizationQuantities[c.id] ?? 0;
                    const priceDelta = parseDecimal(c.price_delta, 0);

                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{c.label}</span>
                          <span className="text-kk-ter-text">
                            {c.child_name} ({c.child_sku})
                          </span>
                          {priceDelta !== 0 && (
                            <span className="text-kk-ter-text">
                              {priceDelta > 0 ? "+" : "−"}
                              {formatMoney(priceDelta)} each
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-full 
                                border border-kk-border-strong text-xs"
                            onClick={() =>
                              handleCustomizationQtyChange(c, -1)
                            }
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center text-xs font-semibold">
                            {qty}
                          </span>
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-full 
                                border border-kk-border-strong text-xs"
                            onClick={() =>
                              handleCustomizationQtyChange(c, 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Quantity + totals */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="mb-1 text-base font-medium text-kk-pri-text">
                Quantity
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-sm"
                  onClick={() => handleChangeQuantity(-1)}
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center text-lg font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-sm"
                  onClick={() => handleChangeQuantity(1)}
                >
                  +
                </button>
              </div>
              {outOfStock && (
                <div className="mt-2 text-xs font-semibold text-kk-err">
                  Out of stock
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="text-sm font-medium text-kk-pri-text">
                Total Price
              </span>
              <div className="text-lg font-semibold text-kk-acc">
                {formatMoney(lineSubtotal)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between gap-3 border-t border-kk-border px-6 py-4">
          <button
            type="button"
            className="flex-1 rounded-md border border-kk-border-strong px-4 
                py-2 text-sm font-medium text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-4 py-2 text-sm transition font-semibold ${
              canAddToCart
                ? "bg-kk-acc hover:bg-kk-hover text-kk-pri-bg cursor-pointer"
                : "cursor-not-allowed bg-kk-border-strong"
            }`}
            disabled={!canAddToCart}
            onClick={handleAdd}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};
