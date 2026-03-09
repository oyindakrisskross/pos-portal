import api from "./client";

export interface POSSubscriptionConsumePayload {
  qr_token: string;
  location_id: number;
  pos_reference?: string;
}

export interface POSSubscriptionConsumeResponse {
  status: string;
  subscription_id: number;
  used_uses: number | null;
  total_uses: number | null;
  subscription_status: string;
  visit_log_id: number;
  entry_method?: string;
}

export async function consumeSubscriptionEntryPass(
  payload: POSSubscriptionConsumePayload
) {
  const res = await api.post<POSSubscriptionConsumeResponse>(
    "/api/v1/pos/subscriptions/consume",
    payload
  );
  return res.data;
}

export interface POSWalletConsumePayload {
  qr_token: string;
  location_id: number;
  pos_reference?: string;
}

export interface POSWalletConsumeResponse {
  status: string;
  wallet_item_id: number;
  visit_log_id: number;
  entry_method?: string;
}

export async function consumeWalletTicket(payload: POSWalletConsumePayload) {
  const res = await api.post<POSWalletConsumeResponse>(
    "/api/v1/pos/redemptions/consume",
    payload
  );
  return res.data;
}
