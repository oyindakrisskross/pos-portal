// src/components/ProcessPaymentModal.tsx

import React, { useEffect, useState } from "react";
import type { CartLine, CartPricingSummary } from "../types/catalog";
import {
  buildPOSCheckoutRequest,
  buildPriceCartPreviewPayload,
  parseCartPricingSummary,
  type BuildCheckoutContext,
  type PaymentMethodCode,
} from "../helpers/invoiceHelpers";
import type { AppliedCoupon, InvoiceResponse } from "../types/invoice";
import { checkOut, fetchPriceCart } from "../api/cart";
import { formatMoney } from "../helpers/posHelpers";
import { CreditCard, Smartphone } from "lucide-react";

interface ProcessPaymentModalProps {
  isOpen: boolean;
  locationId: number;
  cart: CartLine[];
  appliedCoupon?: AppliedCoupon | null;
  onClose: () => void;
  onPaymentCompleted: (invoice: InvoiceResponse) => void;
}

type UiPaymentMethod = "POS_TERMINAL" | "BANK_TRANSFER" | "QR_CODE";

const uiToBackendMethod: Record<UiPaymentMethod, PaymentMethodCode> = {
  POS_TERMINAL: "CARD",
  BANK_TRANSFER: "TRANSFER",
  QR_CODE: "OTHER",
};

export const ProcessPaymentModal: React.FC<ProcessPaymentModalProps> = ({
  isOpen,
  locationId,
  cart,
  appliedCoupon: appliedCouponProp,
  onClose,
  onPaymentCompleted,
}) => {
  const [pricing, setPricing] = useState<CartPricingSummary | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    appliedCouponProp ?? null
  );

  const [paymentMethod, setPaymentMethod] =
    useState<UiPaymentMethod>("POS_TERMINAL");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cartIsEmpty = cart.length === 0;

  const apiErrorMessage = (err: any, fallback: string) => {
    const data = err?.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data?.detail) return String(data.detail);
    if (data?.message) return String(data.message);
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      return String(data.non_field_errors[0]);
    }
    return err?.message || fallback;
  };

  // Whenever modal opens or cart changes, fetch a fresh preview
  useEffect(() => {
    if (!isOpen || cartIsEmpty) {
      setPricing(null);
      setPricingError(null);
      setAppliedCoupon(appliedCouponProp ?? null);
      return;
    }

    const fetchPricing = async () => {
      try {
        setPricingLoading(true);
        setPricingError(null);

        const payload = buildPriceCartPreviewPayload(
          cart, 
          locationId,
          "AMOUNT",
          "0.00",
          appliedCouponProp?.code ?? ""
        );

        const data = await fetchPriceCart(payload);
        const summary = parseCartPricingSummary(data);
        setPricing(summary);
        setAppliedCoupon((data?.applied_coupon as AppliedCoupon) ?? null);

        // default quick amount: grand total
        setAmountPaid(summary.grandTotal.toString());
      } catch (err: any) {
        setPricingError(apiErrorMessage(err, "Unable to price cart."));
      } finally {
        setPricingLoading(false);
      }
    };

    fetchPricing();
  }, [isOpen, cart, cartIsEmpty, locationId, appliedCouponProp?.code]);

  // Buttons (grand total + a few handy fixed values)
  // const quickAmounts = useMemo(() => {
  //   const grand = pricing?.grandTotal ?? 0;
  //   if (!grand) {
  //     return [0, 3000, 5000, 10000];
  //   }
  //   // First button is always the exact grand total
  //   return [grand, Math.ceil(grand + 200), Math.ceil(grand + 1000), Math.ceil(grand + 1500)];
  // }, [pricing]);

  // const handleQuickAmountClick = (val: number) => {
  //   if (!val) return;
  //   setAmountPaid(val.toString());
  //   setCustomAmount("");
  // };

  // const handleCustomAmountChange = (v: string) => {
  //   setCustomAmount(v);
  //   setAmountPaid(v);
  // };

  const grandTotal = pricing?.grandTotal ?? 0;
  const paidNumber = Number(amountPaid || 0);
  const hasValidPayment =
    paidNumber > 0 || (grandTotal <= 0 && paidNumber === 0);

  const canSubmit =
    !cartIsEmpty &&
    !submitting &&
    !pricingLoading &&
    !!pricing &&
    hasValidPayment;

  const handleSubmit = async () => {
    if (!canSubmit || !pricing) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const ctx: BuildCheckoutContext = {
        locationId,
        discountType: "AMOUNT",
        discountValue: "0.00",
        paymentMethod: uiToBackendMethod[paymentMethod],
        amountPaid,
        customerId: null,
        notes: "",
        couponCode: appliedCoupon?.code ?? "",
      };

      const payload = buildPOSCheckoutRequest(cart, ctx);

      const invoice: InvoiceResponse = await checkOut(payload);
      onPaymentCompleted(invoice);
    } catch (err: any) {
      setSubmitError(apiErrorMessage(err, "Unable to complete payment."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-kk-pri-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-xl tracking-wide font-semibold text-kk-pri-text">
            Process Payment
          </h2>
          <button
            type="button"
            className="text-xl leading-none text-kk-ter-text hover:text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* Order summary */}
          <section className="rounded-xl bg-kk-sec-bg px-4 py-3">
            <h3 className="mb-2 text-base font-semibold text-kk-sec-text">
              Order Summary
            </h3>
            {pricingLoading && <p className="text-base text-kk-sec-text">Loading…</p>}
            {pricingError && (
              <p className="text-xs text-kk-err">{pricingError}</p>
            )}
            {pricing && !pricingLoading && !pricingError && (
              <>
                <div className="flex justify-between text-sm text-kk-sec-text">
                  <span>Subtotal ({cart.length} items)</span>
                  <span>{formatMoney(pricing.subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm text-kk-sec-text">
                  <span>VAT (7.5%)</span>
                  <span>{formatMoney(pricing.taxTotal)}</span>
                </div>
                {pricing.discountTotal > 0 && (
                  <div className="mt-1 flex justify-between text-sm text-kk-err">
                    <span>
                      {appliedCoupon?.code ? `Coupon (${appliedCoupon.code})` : "Discount"}
                    </span>
                    <span>-{formatMoney(pricing.discountTotal)}</span>
                  </div>
                )}
                <div className="mt-3 border-t pt-2 text-lg font-semibold text-kk-pri-text">
                  <div className="flex justify-between">
                    <span>Total Amount</span>
                    <span>{formatMoney(pricing.grandTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Payment method tabs */}
          <section>
            <h3 className="mb-2 text-base font-semibold text-kk-pri-text">
              Payment Method
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "POS_TERMINAL", label: "POS Terminal", icon: (<CreditCard className="w-4 h-4" />) },
                { key: "BANK_TRANSFER", label: "Bank Transfer", icon: (<Smartphone className="w-4 h-4" />) },
                // { key: "QR_CODE", label: "QR Code", icon: (<QrCode className="w-4 h-4" />) },
              ].map((opt) => {
                const active = paymentMethod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`flex flex-col items-center justify-center rounded-md cursor-pointer border px-4 py-3 text-sm font-medium ${
                      active
                        ? "border-kk-acc bg-kk-acc text-kk-pri-bg"
                        : "border-kk-border bg-kk-pri-bg text-kk-pri-text"
                    } gap-2`}
                    onClick={() =>
                      setPaymentMethod(opt.key as UiPaymentMethod)
                    }
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Amount paid */}
          {/* <section>
            <h3 className="mb-2 text-base font-semibold text-kk-pri-text">
              Select Amount Paid
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {quickAmounts.map((amt, idx) => (
                <button
                  key={`${amt}-${idx}`}
                  type="button"
                  disabled={!amt}
                  className={`rounded-md border px-4 py-3 text-sm font-semibold ${
                    amountPaid === String(amt)
                      ? "border-kk-acc bg-kk-acc/10 text-kk-hover"
                      : "border-kk-border bg-kk-pri-bg text-kk-pri-text"
                  } ${!amt ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => handleQuickAmountClick(amt)}
                >
                  {amt ? formatMoney(amt) : "—"}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <p className="mb-1 text-sm font-medium text-kk-pri-text">
                Or Enter Custom Amount
              </p>
              <input
                type="number"
                min={0}
                step="0.01"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="w-full rounded-md border border-kk-border-strong px-3 py-2 text-sm"
                placeholder="Enter amount paid"
              />
            </div>
          </section> */}

          {/* Optional customer fields (not yet persisted anywhere) */}
          {/* TODO: Phase 2, introduce customer at checkout */}
          {/* <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">
                Customer Name (Optional)
              </p>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Enter customer name"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">
                Phone Number (Optional)
              </p>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Enter phone number"
              />
            </div>
          </section> */}

          {submitError && (
            <p className="text-xs font-semibold text-kk-err">{submitError}</p>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-4 border-t border-kk-border px-6 py-4">
          <button
            type="button"
            className="flex-1 rounded-lg border border-kk-border cursor-pointer px-4 py-2 text-sm 
                        font-medium text-kk-sec-text hover:bg-red-500 hover:text-kk-sec-bg
                        transition-all duration-300"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer text-kk-pri-bg ${
              canSubmit ? "bg-kk-acc hover:bg-kk-hover" : "bg-kk-ter-bg"
            } transition-all duration-300`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Completing…" : "Complete Payment"}
          </button>
        </div>
      </div>
    </div>
  );
};
