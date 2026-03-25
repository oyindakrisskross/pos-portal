import api from "./client";

export interface POSLookupContactRecord {
  contact_id: number;
  portal_customer_id: number | null;
  employee_id: number | null;
  name: string;
  masked_phone: string | null;
  masked_email: string | null;
}

export interface POSLookupSubscriptionSummary {
  subscription_id: number;
  plan_name: string;
  status: string;
  physical_card_serial?: string | null;
  started_at: string;
  expires_at: string | null;
  total_uses: number | null;
  used_uses: number;
  remaining_uses: number | null;
}

export interface POSLookupPrepaidSummary {
  invoice_id: number;
  invoice_number: string;
  prepaid_number: string;
  prepaid_redeem_status: string;
  location_id: number;
  location_name: string;
  last_redeemed_at: string | null;
  remaining_quantity: string;
}

export interface POSLookupVerifyResponse {
  lookup_token: string;
  contact: POSLookupContactRecord;
  subscriptions: POSLookupSubscriptionSummary[];
  prepaids: POSLookupPrepaidSummary[];
}

export interface POSLookupSubscriptionDetail {
  kind: "SUBSCRIPTION";
  token: string;
  subscription_id: number;
  subscription_status: string;
  plan_id: number;
  plan_name: string;
  customer_id: number;
  customer_name: string;
  physical_card_serial?: string | null;
  total_uses: number | null;
  used_uses: number;
  remaining_uses: number | null;
  lines: Array<{
    plan_item_id: number;
    item_id: number;
    item_name: string;
    item_sku?: string;
    max_quantity: number;
    max_redemptions: number;
    interval_unit: string;
    interval_value: number;
  }>;
}

export interface POSLookupPrepaidDetail {
  kind: "PREPAID";
  invoice_id: number;
  invoice_number: string;
  prepaid_number: string;
  prepaid_redeem_status: string;
  location_id: number;
  location_name: string;
  last_redeemed_at: string | null;
  remaining_quantity: string;
  lines: Array<{
    line_id: number;
    item_id: number;
    item_name: string;
    item_sku?: string;
    quantity: string;
    redeemed_quantity: string;
    refunded_quantity?: string;
    remaining_quantity: string;
    redeem_status: string;
  }>;
}

export type POSLookupAssetDetail = POSLookupSubscriptionDetail | POSLookupPrepaidDetail;

export interface POSLookupCardSubscriptionDetail extends POSLookupSubscriptionDetail {}

export async function searchLookupContacts(q: string) {
  const search = new URLSearchParams();
  if (q.trim()) search.set("q", q.trim());
  const res = await api.get<{ results: POSLookupContactRecord[] }>(
    `/api/sales/pos/contact-lookup/search/${search.toString() ? `?${search}` : ""}`
  );
  return Array.isArray(res.data?.results) ? res.data.results : [];
}

export async function resolveLookupContact(raw: string) {
  const res = await api.post<{ contact: POSLookupContactRecord }>(
    "/api/sales/pos/contact-lookup/resolve/",
    { raw }
  );
  return res.data.contact;
}

export async function verifyLookupContact(contactId: number, identifier: string) {
  const res = await api.post<POSLookupVerifyResponse>(
    "/api/sales/pos/contact-lookup/verify/",
    {
      contact_id: contactId,
      identifier,
    }
  );
  return res.data;
}

export async function fetchLookupAssetDetail(params: {
  lookupToken: string;
  kind: "SUBSCRIPTION" | "PREPAID";
  assetId: number;
  locationId: number;
}) {
  const res = await api.post<POSLookupAssetDetail>("/api/sales/pos/contact-lookup/detail/", {
    lookup_token: params.lookupToken,
    kind: params.kind,
    asset_id: params.assetId,
    location_id: params.locationId,
  });
  return res.data;
}

export async function lookupSubscriptionByPhysicalCard(params: {
  planId: number;
  physicalCardSerial: string;
  locationId: number;
}) {
  const res = await api.post<POSLookupCardSubscriptionDetail>(
    "/api/sales/pos/contact-lookup/subscription-card/",
    {
      plan_id: params.planId,
      physical_card_serial: params.physicalCardSerial,
      location_id: params.locationId,
    }
  );
  return res.data;
}
