// src/api/order.ts

import api from "./client";
import { type InvoiceResponse } from "../types/invoice";

export interface PaginatedResult<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export async function fetchOrders(params?: Record<string, any>) {
  const res = await api.get<PaginatedResult<InvoiceResponse>>("/api/sales/invoices/", {params});
  return res.data;
}