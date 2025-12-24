// src/components/PosItemCustomizeModal.tsx

import { useMemo, useState, useEffect } from "react";
import type {
  AddToCartPayload,
  CustomizationSelection,
  ItemCustomization,
  POSItem,
} from "../types/catalog";
import { formatMoney, parseDecimal } from "../helpers/posHelpers";

interface PosItemCustomizeModalProps {
  isOpen: boolean;
  item: POSItem | null;
  onClose: () => void;
  onAddToCart: (payload: AddToCartPayload) => void;
}

const PRICING_INCLUDED = "INCLUDED";
const PRICING_EXTRA = "EXTRA";
const PRICING_DISCOUNT = "DISCOUNT";

export const PosItemCustomizeModal: React.FC<PosItemCustomizeModalProps> = ({
  isOpen,
  item,
  onClose,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setQuantity(1);
      setSelectedIds({});
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const basePrice = parseDecimal(item.price, 0);

  const addOns: ItemCustomization[] =
    item.customizations?.filter((c) => c.pricing_type === PRICING_EXTRA) ?? [];

  const removeItems: ItemCustomization[] =
    item.customizations?.filter(
      (c) =>
        c.pricing_type === PRICING_DISCOUNT ||
        c.pricing_type === PRICING_INCLUDED
    ) ?? [];

  const toggleCustomization = (id: number) => {
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const totalDeltaPerUnit = useMemo(() => {
    if (!item.customizations) return 0;

    let total = 0;
    for (const c of item.customizations) {
      if (!selectedIds[c.id]) continue;
      const delta = parseDecimal(c.price_delta, 0);

      if (c.pricing_type === PRICING_EXTRA) {
        total += delta;
      } else if (c.pricing_type === PRICING_DISCOUNT) {
        // discount (remove something) → subtract
        total -= Math.abs(delta || 0);
      }
      // INCLUDED -> usually 0, no price change
    }
    return total;
  }, [item.customizations, selectedIds]);

  const lineSubtotal = (basePrice + totalDeltaPerUnit) * quantity;

  const handleChangeQuantity = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleAdd = () => {
    const selectedCustomizations: CustomizationSelection[] = [];

    if (item.customizations?.length) {
      for (const c of item.customizations) {
        if (!selectedIds[c.id]) continue;

        // For now treat checkbox as quantity 1 per parent unit.
        selectedCustomizations.push({
          customizationId: c.id,
          quantity: 1,
        });
      }
    }

    onAddToCart({
      item,
      quantity,
      customizations: selectedCustomizations,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="w-full max-w-xl rounded-xl bg-kk-pri-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-2xl tracking-wide font-semibold text-kk-pri-text">
            {item.name}
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

        <div className="max-h-[75vh] overflow-y-auto px-6 py-4 space-y-5">
          {/* Base Item */}
          <section>
            <h3 className="mb-2 text-base font-medium text-kk-pri-text">
              Base Item
            </h3>
            <div className="flex items-center justify-between rounded-md bg-kk-sec-bg px-4 py-5 text-base">
              <span className="font-medium text-kk-pri-text">{item.name}</span>
              <span className="text-base font-semibold text-kk-acc">
                {formatMoney(basePrice)}
              </span>
            </div>
          </section>

          {/* Add-ons */}
          {addOns.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-medium text-kk-pri-text">
                Add-ons
              </h3>
              <div className="space-y-2">
                {addOns.map((c) => {
                  const checked = !!selectedIds[c.id];
                  const delta = parseDecimal(c.price_delta, 0);

                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center justify-between rounded-md border px-4 py-3 text-sm hover:border-kk-acc"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCustomization(c.id)}
                          className="h-4 w-4 rounded border-kk-border accent-kk-acc cursor-pointer"
                        />
                        <span className="text-kk-pri-text">{c.label}</span>
                      </div>
                      {delta !== 0 && (
                        <span className="text-sm font-semibold text-kk-acc">
                          +{formatMoney(delta)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* Remove Items (Optional) */}
          {removeItems.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-medium text-kk-pri-text">
                Remove Items (Optional)
              </h3>
              <div className="space-y-2">
                {removeItems.map((c) => {
                  const checked = !!selectedIds[c.id];
                  const delta = parseDecimal(c.price_delta, 0);

                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center justify-between rounded-md border 
                          px-4 py-3 text-sm hover:border-kk-acc"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCustomization(c.id)}
                          className="h-4 w-4 rounded border-kk-border accent-kk-acc"
                        />
                        <span className="text-kk-pri-text">{c.label}</span>
                      </div>
                      {delta !== 0 && (
                        <span className="text-sm font-semibold text-kk-err">
                          −₦{formatMoney(delta)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quantity + totals */}
          <section className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="mb-1 text-base font-medium text-kk-pri-text">
                Quantity
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full 
                      border border-kk-border-strong text-sm"
                  onClick={() => handleChangeQuantity(-1)}
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center text-base font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full 
                      border border-kk-border-strong text-sm"
                  onClick={() => handleChangeQuantity(1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-base font-medium text-kk-pri-text">
                Total Price
              </span>
              <div className="text-lg font-semibold text-kk-acc">
                {formatMoney(lineSubtotal)}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t 
          border-kk-border px-6 py-4">
          <button
            type="button"
            className="flex-1 rounded-md border border-kk-border-strong 
                px-4 py-2 text-sm font-medium text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-kk-acc px-4 py-2 text-sm font-semibold 
              hover:bg-kk-hover cursor-pointer text-kk-pri-bg"
            onClick={handleAdd}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};
