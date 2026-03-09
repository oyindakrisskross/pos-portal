import api from "./client";
import type {
  POSCustomerRecord,
  POSCustomerSubscriptionRecord,
  POSSubscriptionPlan,
  POSSubscriptionProduct,
  PaymentMethodCode,
} from "../types/subscriptions";

export interface PaginatedResult<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export async function fetchSubscriptionProducts(params?: Record<string, unknown>) {
  const res = await api.get<PaginatedResult<POSSubscriptionProduct>>("/api/subscriptions/products/", {
    params,
  });
  return res.data;
}

export async function fetchSubscriptionPlans(params?: Record<string, unknown>) {
  const res = await api.get<PaginatedResult<POSSubscriptionPlan>>("/api/subscriptions/plans/", {
    params,
  });
  return res.data;
}

export async function fetchPortalCustomers(params?: {
  search?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
}) {
  const search = new URLSearchParams();

  if (params?.search) search.set("search", params.search);
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.page_size != null) search.set("page_size", String(params.page_size));
  if (params?.is_active != null) search.set("is_active", String(params.is_active));

  const res = await api.get<PaginatedResult<POSCustomerRecord>>(
    `/api/customer-portal/customers/${search.toString() ? `?${search}` : ""}`
  );
  return res.data;
}

export async function createPortalCustomer(payload: {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  password?: string;
  is_active?: boolean;
}) {
  const res = await api.post<POSCustomerRecord>("/api/customer-portal/customers/", payload);
  return res.data;
}

export async function createCustomerSubscription(payload: {
  customer: number;
  plan: number;
  started_at?: string;
  source_invoice_id?: number | null;
  payment_made?: boolean;
  amount_paid?: string;
  payment_method?: PaymentMethodCode;
  payment_reference?: string;
}) {
  const res = await api.post<POSCustomerSubscriptionRecord>("/api/subscriptions/subscriptions/", payload);
  return res.data;
}
