import type { CartLine, CartPricingSummary, ItemCustomization } from "../types/catalog";
import type { 
  InvoiceItemCustomizationInput, 
  InvoiceItemInput, 
  PriceCartItemInput,
  PriceCartPreviewPayload,
  InvoiceDiscountType,
  InvoiceCheckoutPayload,
  POSCheckoutPaymentInput,
} from "../types/invoice";

// UI → backend payment codes
export type PaymentMethodCode = "CASH" | "CARD" | "TRANSFER" | "OTHER";

export interface BuildCheckoutContext {
  locationId: number;
  discountType?: InvoiceDiscountType;
  discountValue?: string;
  paymentMethod: PaymentMethodCode;
  amountPaid: string;       // e.g. "2150.00"
  customerId?: number | null;
  notes?: string;
  couponCode?: string;
  couponCodes?: string[];
}

function resolveCustomizationUnitPrice(def: ItemCustomization): string {
  const delta = parseFloat(def.price_delta || "0") || 0;
  if (!delta) return "0";

  if (def.pricing_type === "DISCOUNT") {
    return (-Math.abs(delta)).toString();
  }
  if (def.pricing_type === "INCLUDED") {
    return "0";
  }
  return delta.toString();
}

/**
 * Looks up the full ItemCustomization record for a given selection on a CartLine.
 */
function resolveCustomization(
  line: CartLine,
  customizationId: number
): ItemCustomization | undefined {
  return line.item.customizations?.find((c) => c.id === customizationId);
}

/**
 * Build the nested "items" array expected by InvoiceCreateSerializer
 * (parents + nested `customizations`) from the current cart.
 */
export function buildInvoiceItemsFromCart(cart: CartLine[]): InvoiceItemInput[] {
  const items: InvoiceItemInput[] = [];

  for (const line of cart) {
    const base: InvoiceItemInput = {
      item: line.item.id,
      quantity: String(line.quantity),
      // If you ever add per-line overrides or discounts you can plug them here
      unit_price: line.item.price,
      discount_amount: "0.00",
      tax_amount: "0.00",
      line_note: "", // could come from cart later
      customization_label: "",
    };

    const customs: InvoiceItemCustomizationInput[] = [];

    for (const sel of line.customizations || []) {
      const def = resolveCustomization(line, sel.customizationId);
      if (!def) continue;

      const perParentQty = sel.quantity; // quantity per 1 parent
      const totalQty = Number(line.quantity) * perParentQty;

      customs.push({
        item: def.child,
        quantity: String(totalQty),
        // price_delta is the extra (or discount) per 1 unit
        unit_price: resolveCustomizationUnitPrice(def),
        discount_amount: "0.00",
        tax_amount: "0.00",
        customization_label: def.label,
      });
    }

    if (customs.length > 0) {
      base.customizations = customs;
    }

    items.push(base);
  }

  return items;
}

/**
 * Build the flat list of {item, quantity, unit_price} expected by /sales/price-cart/.
 * Mirrors the pricing logic used in the POS cart (including INCLUDED / DISCOUNT add-ons).
 */
export function buildPriceCartItemsFromCart(cart: CartLine[]): PriceCartItemInput[] {
  const items: PriceCartItemInput[] = [];

  for (let parentIdx = 0; parentIdx < cart.length; parentIdx++) {
    const line = cart[parentIdx];
    // parent line
    items.push({
      item: line.item.id,
      quantity: String(line.quantity),
      unit_price: line.item.price,
      discount_amount: "0.00",
      tax_amount: "0.00",
      parent_idx: parentIdx,
      is_child: false,
    });

    // customization lines
    for (const sel of line.customizations || []) {
      const def = resolveCustomization(line, sel.customizationId);
      if (!def) continue;

      const effectiveQty = Number(line.quantity) * sel.quantity;
      if (effectiveQty <= 0) continue;

      const unit_price = resolveCustomizationUnitPrice(def);
      // only include if customization has a configured delta (even if INCLUDED -> 0)
      if ((parseFloat(def.price_delta || "0") || 0) === 0) continue;

      items.push({
        item: def.child,
        quantity: String(effectiveQty),
        unit_price,
        discount_amount: "0.00",
        tax_amount: "0.00",
        parent_idx: parentIdx,
        is_child: true,
      });
    }
  }

  return items;
}

/**
 * Flatten parents + customizations into a simple list for the /sales/price-cart/
 * preview endpoint. This mirrors the serializer's `flat_lines` structure.
 */
export function buildPriceCartPreviewPayload(
  cart: CartLine[],
  locationId: number,
  invoiceDiscountType: InvoiceDiscountType = "AMOUNT",
  invoiceDiscountValue = "0.00",
  couponCode = "",
  couponCodes: string[] = []
): PriceCartPreviewPayload {
  const items = buildPriceCartItemsFromCart(cart);

  return {
    location: locationId,
    invoice_discount_type: invoiceDiscountType,
    invoice_discount_value: invoiceDiscountValue,
    coupon_code: couponCode,
    coupon_codes: couponCodes,
    items,
  };
}

/**
 * Build the full POS checkout payload combining invoice items + payments.
 * You pass BuildCheckoutContext with payment method & amount.
 */
export function buildPOSCheckoutRequest(
  cart: CartLine[],
  ctx: BuildCheckoutContext
): InvoiceCheckoutPayload {
  const items = buildInvoiceItemsFromCart(cart);

  const payment: POSCheckoutPaymentInput = {
    amount: ctx.amountPaid,
    method: ctx.paymentMethod,
    reference: "",
  };

  return {
    location: ctx.locationId,
    type_id: "SALE",
    customer: ctx.customerId ?? null,
    notes: ctx.notes ?? "",
    coupon_code: ctx.couponCode ?? "",
    coupon_codes: ctx.couponCodes ?? (ctx.couponCode ? [ctx.couponCode] : []),
    invoice_discount_type: ctx.discountType ?? "AMOUNT",
    invoice_discount_value: ctx.discountValue ?? "0.00",
    items,
    payments: [payment],
  };
}


/**
 * Parse the /price-cart/ response into a numeric summary for the UI.
 */
export function parseCartPricingSummary(data: any): CartPricingSummary {
  const toNum = (v: any): number => Number(v ?? 0);

  return {
    subtotal: toNum(data?.subtotal),
    taxTotal: toNum(data?.tax_total),
    discountTotal: toNum(data?.discount_total),
    grandTotal: toNum(data?.grand_total),
  };
}
