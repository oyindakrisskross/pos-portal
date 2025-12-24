// src/api/cart.ts

import type { InvoiceCheckoutPayload } from "../types/invoice";
import api from "./client";

export async function fetchPriceCart(params?: Record<string, any>) {
  const res = await api.post("/api/sales/price-cart/", params);
  return res.data;
}

export async function createHoldCart(params?: Record<string, any>) {
  const res = await api.post("/api/sales/hold/create/", params);
  return res.data;
}

export async function fetchHeldOrders(locationId: number) {
  const res = await api.get(
    `/api/sales/hold/list/?location_id=${encodeURIComponent(locationId)}`
  );
  return res.data;
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