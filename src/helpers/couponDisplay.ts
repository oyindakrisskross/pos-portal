import type { AppliedCoupon, InvoiceResponse } from "../types/invoice";

const DEFAULT_COUPON_LABEL = "Coupon";

const clean = (value: unknown): string => String(value ?? "").trim();

const uniqueLabels = (labels: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  labels.forEach((label) => {
    const normalized = clean(label);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

export const getCouponDisplayName = (
  coupon: Pick<AppliedCoupon, "name" | "coupon_name"> | null | undefined,
  fallbackLabel = DEFAULT_COUPON_LABEL
): string => {
  const directName = clean(coupon?.name);
  if (directName) return directName;
  const altName = clean(coupon?.coupon_name);
  return altName || fallbackLabel;
};

export const getAppliedCouponNames = (appliedCoupons: AppliedCoupon[] = []): string[] => {
  return uniqueLabels(
    appliedCoupons.map((coupon, idx) =>
      getCouponDisplayName(
        coupon,
        appliedCoupons.length > 1 ? `${DEFAULT_COUPON_LABEL} ${idx + 1}` : DEFAULT_COUPON_LABEL
      )
    )
  );
};

export const getInvoiceCouponNames = (
  invoice: Pick<InvoiceResponse, "coupon_names" | "coupon_code" | "coupon_codes">,
  fallbackNames: string[] = []
): string[] => {
  const payloadNames = uniqueLabels(Array.isArray(invoice.coupon_names) ? invoice.coupon_names : []);
  if (payloadNames.length) return payloadNames;

  const fallback = uniqueLabels(fallbackNames);
  if (fallback.length) return fallback;

  const couponCodes = Array.isArray(invoice.coupon_codes)
    ? invoice.coupon_codes.filter(Boolean)
    : [];
  const codeCount = couponCodes.length || (invoice.coupon_code ? 1 : 0);
  if (!codeCount) return [];

  if (codeCount === 1) return [DEFAULT_COUPON_LABEL];
  return Array.from({ length: codeCount }, (_, idx) => `${DEFAULT_COUPON_LABEL} ${idx + 1}`);
};
