export type SubscriptionStatus = "ACTIVE" | "INACTIVE";
export type PlanType = "CYCLE" | "USAGE";
export type BillingFrequencyUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type PaymentMethodCode = "CASH" | "CARD" | "TRANSFER" | "OTHER";

export interface POSSubscriptionProduct {
  id: number;
  name: string;
  description?: string | null;
  status: SubscriptionStatus;
}

export interface POSSubscriptionPlan {
  id: number;
  product: number;
  product_name?: string;
  name: string;
  code: string;
  price: string;
  setup_fee?: string;
  sales_tax_rate?: string | null;
  billing_frequency_value: number;
  billing_frequency_unit: BillingFrequencyUnit;
  uses_physical_card?: boolean;
  requires_card_serial?: boolean;
  plan_type: PlanType;
  status: SubscriptionStatus;
}

export interface POSCustomerRecord {
  id: number;
  contact_id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface POSCustomerSubscriptionRecord {
  id: number;
  customer: number;
  customer_name: string;
  customer_email: string;
  plan: number;
  plan_name: string;
  plan_uses_physical_card?: boolean;
  plan_requires_card_serial?: boolean;
  status: "ACTIVE" | "UNPAID" | "EXPIRED" | "DEPLETED" | "CANCELLED";
  started_at: string;
  physical_card_serial?: string | null;
  source_invoice: number | null;
  source_invoice_number: string | null;
}
