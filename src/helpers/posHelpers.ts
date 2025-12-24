// src/helpers/posScreen.ts

import type { CartLine, POSItem } from "../types/catalog";

export function parseDecimal(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

export function findVariantForSelection(
  items: POSItem[],
  selection: Record<number, number>
): POSItem | null {
  if (!items.length) return null;

  // If no variant_data is present, just return the first one
  if (!items[0].variant_data) {
    return items[0];
  }

  const attributeIds = Object.keys(selection);
  if (!attributeIds.length) return null;

  for (const item of items) {
    if (!item.variant_data) continue;

    const matchesAll = attributeIds.every((attrIdStr) => {
      const attrId = Number(attrIdStr);
      const selectedOption = selection[attrId];
      const itemOption = item.variant_data![attrIdStr];
      return itemOption === selectedOption;
    });

    if (matchesAll) return item;
  }

  return null;
}

export const formatMoney = (value: string | number) => {
  const n =
    typeof value === "number" ? value : parseFloat(value || "0") || 0;
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Compute total for a single cart line (parent + customizations)
export function computeLineTotals(line: CartLine): { unitPrice: number; lineTotal: number } {
  const baseUnit = parseDecimal(line.item.price, 0);
  let total = baseUnit * line.quantity;

  if (line.customizations?.length && line.item.customizations?.length) {
    const customizationById = new Map(
      line.item.customizations.map((c) => [c.id, c])
    );

    for (const sel of line.customizations) {
      const meta = customizationById.get(sel.customizationId);
      if (!meta) continue;

      const delta = parseDecimal(meta.price_delta, 0);
      if (!delta) continue;

      const count = sel.quantity * line.quantity;

      if (meta.pricing_type === "EXTRA") {
        total += delta * count;
      } else if (meta.pricing_type === "DISCOUNT") {
        total -= delta * count;
      }
      // "INCLUDED" -> no change, purely inventory / description
    }
  }

  const unitPrice = line.quantity > 0 ? total / line.quantity : 0;
  return { unitPrice, lineTotal: total };
}
