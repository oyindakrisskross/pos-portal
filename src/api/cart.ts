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
