// src/types/invoice.ts

export type PaymentMethodCode = "CASH" | "CARD" | "TRANSFER" | "OTHER";

export interface InvoiceItemInput {
  item: number;
  quantity: string;
  unit_price?: string;
  discount_amount?: string;
  tax_amount?: string;
  line_note?: string;
  customization_label?: string;
  customizations?: InvoiceItemCustomizationInput[];
}

export interface InvoiceItemCustomizationInput {
  item: number;
  quantity: string;
  unit_price?: string;
  discount_amount?: string;
  tax_amount?: string;
  customization_label?: string;
}

export interface POSCheckoutPaymentInput {
  amount: string;
  method: string;     // "CARD", "TRANSFER", etc.
  reference?: string;
}

export interface POSCheckoutSubscriptionEntryInput {
  plan: number;
  physical_card_serial?: string | null;
}

export interface InvoiceCheckoutPayload {
  location: number;
  customer?: number | null;
  customer_name?: string | null;
  type_id: "SALE" | "REFUND";
  notes?: string;
  coupon_code?: string;
  coupon_codes?: string[];
  invoice_discount_type: InvoiceDiscountType;
  invoice_discount_value: string;
  items: InvoiceItemInput[];
  payments: POSCheckoutPaymentInput[];
  subscription_entries?: POSCheckoutSubscriptionEntryInput[];
}

export interface PriceCartItemInput {
  item: number;          // Item pk
  quantity: string;      // decimal as string
  unit_price?: string;   // override if needed, otherwise use catalog price
  discount_amount?: string;
  tax_amount?: string;
  // Optional: allow the backend to understand parent/customization groupings,
  // so coupon logic can decide how to treat customized items.
  parent_idx?: number;
  is_child?: boolean;
}

export type InvoiceDiscountType = "AMOUNT" | "PERCENT";

export interface PriceCartPreviewPayload {
  location: number;
  invoice_discount_type: InvoiceDiscountType;
  invoice_discount_value: string;
  coupon_code?: string;
  coupon_codes?: string[];
  items: PriceCartItemInput[];
}

export interface AppliedCoupon {
  name?: string;
  coupon_name?: string;
  code: string;
  type: string;          // "AMOUNT" | "PERCENT" | "LINE"
  value: string;
  amount_applied: string;
  priority?: number;
  allow_combine?: boolean;
  action_type?: string;
}

// A child line embedded under a parent in "children"
export interface InvoiceItemChild {
  id: number;
  item: number;                // item ID
  item_name: string;
  description: string;
  customization_label: string; // "Crash Course", "No Sugar", or "" if none
  quantity: string;            // decimal as string, e.g. "5.00"
  redeemed_quantity?: string;
  redeem_status?: "UNUSED" | "PARTIALLY_REDEEMED" | "REDEEMED" | string;
  unit_price: string;          // decimal as string
  discount_amount: string;
  line_total: string;          // decimal as string
}

// A line as returned in the "items" array
export interface InvoiceItem {
  id: number;
  item: number;
  item_name: string;
  description: string;
  customization_label: string;
  quantity: string;
  redeemed_quantity?: string;
  redeem_status?: "UNUSED" | "PARTIALLY_REDEEMED" | "REDEEMED" | string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  line_total: string;
  parent_line: number | null;        // null for top-level, or parent line id
  children: InvoiceItemChild[];      // nested children for receipt/customizations
}

export interface InvoicePayment {
  id: number;
  amount: string;
  method: string;                    // "CARD", "TRANSFER", etc.
  reference: string;
  paid_on: string;                   // ISO datetime string
}

export interface InvoiceResponse {
  id: number;
  number: string;                    // "INV-9-000001"
  type_id: "SALE" | "REFUND" | "PREPAID";
  prepaid_number?: string | null;
  prepaid_redeem_status?: "UNUSED" | "PARTIALLY_REDEEMED" | "REDEEMED" | string;
  last_redeemed_at?: string | null;
  status: "PAID" | "DRAFT" | "VOID" | string;
  coupon_code?: string;
  coupon_codes?: string[];
  coupon_names?: string[];
  location: number;
  location_name: string;
  customer: number | null;
  customer_name: string | null;
  invoice_date: string;              // ISO datetime
  due_date: string | null;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  grand_total: string;
  amount_paid: string;
  balance_due: string;
  notes: string;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  created_by: number;
  created_by_name: string;
}
