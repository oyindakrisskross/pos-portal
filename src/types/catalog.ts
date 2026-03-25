// src/types/catalog.ts

export type PricingType = "INCLUDED" | "EXTRA" | "DISCOUNT";

export const PRICING_OPTS: {value: PricingType; label: string}[] = [
  { value: "INCLUDED", label: "Add-On: Price Included"},
  { value: "EXTRA", label: "Add-On: Extra"},
  { value: "DISCOUNT", label: "Removable"},
];

export interface ItemCustomization {
  id: number;
  parent: number;
  child: number;
  child_name: string;
  child_sku: string;
  label: string;
  pricing_type: PricingType;
  price_delta: string;
  min_qty: string;
  max_qty: string;
  step_qty: string;
  sort_order: number;
};

export interface CustomizationSelection {
  customizationId: number;
  quantity: number;
}

export interface Attribute {
  id: number;
  name: string;
  options: AttributeOption[];
}

export interface AttributeOption {
  id: number;
  value: string;
  code?: string | null;
}

export interface ItemGroupAttribute {
  id: number;
  attribute_id: number;
  name: string;
  options: AttributeOption[];
}

export type ItemType = "GOOD" | "SERVICE";

export const TYPE_CHOICES: {value: ItemType; label: string}[] = [
  {value: "GOOD", label: "Good"},
  {value: "SERVICE", label: "Service"},
];

export type ItemStatus = "ACTIVE" | "INACTIVE";

export type ItemVisibility = "VISIBLE" | "HIDDEN";

export interface POSItem {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  type_id: ItemType;
  sellable: boolean;
  group: number | null;
  group_name?: string | null;
  unit: number | null;
  unit_name?: string | null;
  price: string;
  sale_tax: number | null;
  sale_tax_rate: string | null;
  inventory_tracking: boolean;
  returnable: boolean;
  scheduled: boolean;
  stock_qty: string;
  primary_image?: string | null;
  group_primary_image?: string | null;
  customized?: boolean;
  variant_key?: string | null;
  variant_data?: Record<string, number>;
  group_attributes?: ItemGroupAttribute[];
  customizations?: ItemCustomization[];
}

export interface AddToCartPayload {
  item: POSItem;
  quantity: number;
  customizations: CustomizationSelection[];
}

export interface CartLine extends AddToCartPayload {
  id: string;
  promo?: boolean;
  prepaid?: boolean;
  redeemSource?: "PREPAID" | "SUBSCRIPTION";
  prepaidInvoiceId?: number;
  prepaidNumber?: string;
  prepaidInvoiceLineId?: number;
  prepaidMaxQty?: number;
  subscriptionToken?: string;
  subscriptionId?: number;
  subscriptionPlanItemId?: number;
  subscriptionSale?: {
    planId: number;
    planCode: string;
    planName: string;
    productId: number;
    productName: string;
    planType: "CYCLE" | "USAGE";
    billingFrequencyValue: number;
    billingFrequencyUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
    setupFee: string;
    salesTaxRate?: string | null;
    usesPhysicalCard?: boolean;
    requiresCardSerial?: boolean;
  };
}

export interface CartPricingSummary {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
}

export interface HeldOrderItem {
  item: number;
  quantity: string;
  unit_price: string;
  customization_id: string;
  customization_qty: string;
}

export interface HeldOrderSummary {
  id: number;
  location: number;
  customer_name: string;
  created_at: string;
  updated_at?: string;
  items_count?: number;
  items?: HeldOrderItem[];
  status: string;
}
