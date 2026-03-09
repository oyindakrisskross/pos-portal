// src/api/cart.ts

import type { InvoiceCheckoutPayload } from "../types/invoice";
import api from "./client";
import type { HeldOrderSummary } from "../types/catalog";

export async function fetchPriceCart(params?: Record<string, any>) {
  const res = await api.post("/api/sales/price-cart/", params);
  return res.data;
}

export async function createHoldCart(params: {
  location: number;
  customer_name: string;
  items: any[];
}) {
  const res = await api.post("/api/sales/hold/create/", params);
  return res.data as { id: number; status: string; customer_name: string };
}

export async function updateHoldCart(
  heldOrderId: number,
  params: { customer_name?: string; items: any[] }
) {
  const res = await api.post(`/api/sales/hold/${heldOrderId}/update/`, params);
  return res.data as { id: number; status: string; customer_name: string };
}

export async function cancelHeldOrder(heldOrderId: number) {
  await api.post(`/api/sales/hold/${heldOrderId}/cancel/`);
}

export async function completeHeldOrder(heldOrderId: number) {
  await api.post(`/api/sales/hold/${heldOrderId}/complete/`);
}

export async function fetchHeldOrders(locationId: number, q?: string) {
  const search = new URLSearchParams({ location_id: String(locationId) });
  if (q && q.trim()) search.set("q", q.trim());
  const res = await api.get(`/api/sales/hold/list/?${search.toString()}`);
  return res.data as HeldOrderSummary[];
}

export async function loadHeldOrder(heldOrderId: number) {
  const res = await api.get(
    `/api/sales/hold/${heldOrderId}/resume/`
  );
  return res.data;
}

export async function checkOut(payload: InvoiceCheckoutPayload) {
  const res = await api.post("/api/sales/pos-checkout/", payload);
  return res.data;
}

export async function fetchInvoiceById(invoiceId: number) {
  const res = await api.get(`/api/sales/invoices/${invoiceId}/`);
  return res.data;
}

export type PrepaidLookupLine = {
  line_id: number;
  item_id: number;
  item_name: string;
  item_sku?: string;
  quantity: string;
  redeemed_quantity: string;
  remaining_quantity: string;
  redeem_status: string;
};

export type PrepaidLookupResponse = {
  invoice_id: number;
  invoice_number: string;
  prepaid_number: string;
  prepaid_redeem_status: string;
  last_redeemed_at?: string | null;
  location_id: number;
  location_name: string;
  lines: PrepaidLookupLine[];
};

export async function lookupPrepaidInvoice(code: string, locationId: number) {
  const search = new URLSearchParams({
    code,
    location_id: String(locationId),
  });
  const res = await api.get<PrepaidLookupResponse>(`/api/sales/prepaid/lookup/?${search.toString()}`);
  return res.data;
}

export type RedeemPrepaidPayload = {
  invoice_id: number;
  lines: Array<{ line_id: number; quantity: string | number }>;
};

export async function redeemPrepaidInvoice(payload: RedeemPrepaidPayload) {
  const res = await api.post("/api/sales/prepaid/redeem/", payload);
  return res.data as {
    detail?: string;
    prepaid_redeem_status?: string;
    invoice?: any;
  };
}

export type SubscriptionLookupLine = {
  plan_item_id: number;
  item_id: number;
  item_name: string;
  item_sku?: string;
  max_quantity: number;
  max_redemptions: number;
  interval_unit: string;
  interval_value: number;
};

export type SubscriptionLookupResponse = {
  token: string;
  subscription_id: number;
  subscription_status: string;
  plan_id: number;
  plan_name: string;
  customer_id: number;
  customer_name: string;
  total_uses: number | null;
  used_uses: number;
  remaining_uses: number | null;
  lines: SubscriptionLookupLine[];
};

export async function lookupSubscriptionPass(token: string, locationId: number) {
  const search = new URLSearchParams({
    token,
    location_id: String(locationId),
  });
  const res = await api.get<SubscriptionLookupResponse>(
    `/api/sales/subscription/lookup/?${search.toString()}`
  );
  return res.data;
}

export type RedeemSubscriptionPayload = {
  token: string;
  location_id: number;
  pos_reference?: string;
  lines: Array<{ plan_item_id: number; quantity: string | number }>;
};

export async function redeemSubscriptionPass(payload: RedeemSubscriptionPayload) {
  const res = await api.post("/api/sales/subscription/redeem/", payload);
  return res.data as {
    detail?: string;
    subscription_id?: number;
    used_uses?: number | null;
    total_uses?: number | null;
    remaining_uses?: number | null;
    subscription_status?: string;
  };
}

export type POSQRKind =
  | "COUPON"
  | "CUSTOMER"
  | "PREPAID"
  | "SUBSCRIPTION_PASS"
  | "WALLET_TICKET";

export type POSQRResolveResponse = {
  kind: POSQRKind;
  coupon?: {
    code: string;
    name?: string;
  };
  customer?: {
    portal_customer_id: number;
    contact_id: number | null;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  prepaid?: {
    code: string;
  };
  subscription?: {
    id: number;
    status: string;
    plan_id: number;
    plan_name: string;
    total_uses: number | null;
    used_uses: number;
    remaining_uses: number | null;
    customer?: {
      portal_customer_id: number;
      contact_id: number | null;
      name: string;
      email?: string | null;
      phone?: string | null;
    } | null;
    coupons?: Array<{
      code: string;
      name: string;
      priority: number;
      allow_combine?: boolean;
    }>;
  };
  redeem?: {
    token: string;
  };
};

export async function resolvePOSQR(raw: string, locationId?: number) {
  const payload: Record<string, unknown> = { raw };
  if (locationId !== undefined && Number.isFinite(locationId)) {
    payload.location_id = locationId;
  }
  const res = await api.post<POSQRResolveResponse>("/api/sales/pos/qr-resolve/", payload);
  return res.data;
}
