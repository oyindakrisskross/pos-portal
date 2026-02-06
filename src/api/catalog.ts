// src/api/catalog.ts

import api from "./client";
import type { POSItem } from "../types/catalog";

const WEEKDAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const buildClientScheduleParams = () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return {
    client_time: `${hh}:${mm}:${ss}`,
    client_weekday: WEEKDAY_CODES[now.getDay()],
  };
};

export interface PaginatedResult<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export async function fetchPOSItems(params?: Record<string, any>) {
  const scheduleParams = buildClientScheduleParams();
  const res = await api.get<POSItem[]>("/api/catalog/pos-items/", {
    params: { ...scheduleParams, ...(params ?? {}) },
  });
  return res.data;
}

export async function fetchPOSItem(itemId: number, params?: Record<string, any>) {
  const scheduleParams = buildClientScheduleParams();
  const res = await api.get<POSItem>(`/api/catalog/pos-items/${itemId}/`, {
    params: { ...scheduleParams, ...(params ?? {}) },
  });
  return res.data;
}
