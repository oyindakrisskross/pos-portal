// src/api/catalog.ts

import api from "./client";
import type { POSItem } from "../types/catalog";

export interface PaginatedResult<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export async function fetchPOSItems(params?: Record<string, any>) {
  const res = await api.get<POSItem[]>("/api/catalog/pos-items/", {
    params,
  });
  return res.data;
}

export async function fetchPOSItem(itemId: number, params?: Record<string, any>) {
  const res = await api.get<POSItem>(`/api/catalog/pos-items/${itemId}/`, {params});
  return res.data;
}