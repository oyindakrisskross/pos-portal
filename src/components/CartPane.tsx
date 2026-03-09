// src/components/CartPane.tsx

import React, { useMemo, useState } from "react";
import type { CartLine, CartPricingSummary } from "../types/catalog";
import { computeLineTotals, formatMoney } from "../helpers/posHelpers";
import { getAppliedCouponNames } from "../helpers/couponDisplay";
import { ProcessPaymentModal } from "./ProcessPaymentModal";
import { ReceiptModal } from "./ReceiptModal";
import type { AppliedCoupon, InvoiceResponse } from "../types/invoice";
import { CreditCard, Percent, ShoppingCart, StretchVertical, Ticket, Trash2 } from "lucide-react";
import { ScanCodeModal } from "./ScanCodeModal";
import { SlotAnimatedValue } from "./SlotAnimatedValue";


interface CartPaneProps {
  lines: CartLine[];
  promoLines?: CartLine[];
  pricing: CartPricingSummary | null;
  appliedCoupons?: AppliedCoupon[];
  manualCouponCodes?: string[];
  lineDiscounts?: Record<string, number>;
  onChangeQty: (lineId: string, delta: number) => void;
  onRemoveLine: (lineId: string) => void;
  onClearCart: () => void;
  onClearAction: () => void;
  onApplyDiscountCode: (raw: string) => Promise<{ ok: boolean; error?: string }>;
  onAssignCustomerCode: (raw: string) => Promise<{ ok: boolean; error?: string }>;
  onRedeemItemsCode: (raw: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveDiscount: () => void;
  onHoldOrder?: () => void;
  locationId: number;
  assignedCustomerId?: number | null;
  assignedPortalCustomerId?: number | null;
  assignedCustomerLabel?: string | null;
  holdOrderLabel?: string;
  clearCartLabel?: string;
  heldOrderName?: string | null;
  holding?: boolean;
  onAfterPaymentCompleted?: (invoice: InvoiceResponse | null) => Promise<void> | void;
  isPrepaidRedeem?: boolean;
  prepaidLabel?: string | null;
  onRedeemPrepaidInvoice?: () => Promise<{ ok: boolean; error?: string }>;
}

export const CartPane: React.FC<CartPaneProps> = ({
  lines,
  promoLines,
  pricing,
  appliedCoupons = [],
  manualCouponCodes = [],
  lineDiscounts,
  onChangeQty,
  onRemoveLine,
  onClearCart,
  onClearAction,
  onRemoveDiscount,
  onHoldOrder,
  locationId,
  assignedCustomerId = null,
  assignedPortalCustomerId = null,
  assignedCustomerLabel = null,
  onApplyDiscountCode,
  onAssignCustomerCode,
  onRedeemItemsCode,
  holdOrderLabel = "Hold Order",
  clearCartLabel = "Clear Cart",
  heldOrderName = null,
  holding = false,
  onAfterPaymentCompleted,
  isPrepaidRedeem = false,
  prepaidLabel = null,
  onRedeemPrepaidInvoice,
}) => {
  const [showProcessPayment, setShowProcessPayment] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<InvoiceResponse | null>(null);
  const [receiptCouponNames, setReceiptCouponNames] = useState<string[]>([]);
  const [showApplyDiscount, setShowApplyDiscount] = useState(false);
  const [showAssignCustomer, setShowAssignCustomer] = useState(false);
  const [showRedeemItems, setShowRedeemItems] = useState(false);
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false);
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const subtotal = pricing?.subtotal ?? 0;
  const taxTotal = pricing?.taxTotal ?? 0;
  const discountTotal = pricing?.discountTotal ?? 0;
  const appliedCouponNames = useMemo(() => getAppliedCouponNames(appliedCoupons), [appliedCoupons]);
  const grandTotal = pricing?.grandTotal ?? 0;

  const displayLines = useMemo(() => [...lines, ...(promoLines ?? [])], [lines, promoLines]);
  const payableLines = useMemo(() => lines.filter((ln) => !ln.prepaid), [lines]);
  const hasSubscriptionSaleLines = useMemo(
    () => lines.some((ln) => Boolean(ln.subscriptionSale)),
    [lines]
  );
  const hasRedeemableLines = useMemo(() => lines.some((ln) => Boolean(ln.prepaid)), [lines]);
  const prepaidSelectedQty = useMemo(
    () => lines.reduce((sum, ln) => sum + Number(ln.quantity || 0), 0),
    [lines]
  );
  const prepaidMaxQty = useMemo(
    () => lines.reduce((sum, ln) => sum + Number(ln.prepaidMaxQty ?? ln.quantity ?? 0), 0),
    [lines]
  );
  const isPartialRedeem = isPrepaidRedeem && prepaidSelectedQty < prepaidMaxQty;

  const handlePaymentCompleted = (invoice: InvoiceResponse | null) => {
    const finalize = async () => {
      setShowProcessPayment(false);
      if (invoice) {
        setReceiptCouponNames(appliedCouponNames);
        setReceiptInvoice(invoice);
      }
      await onAfterPaymentCompleted?.(invoice);
      onClearCart();
    };
    void finalize();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {heldOrderName && (
        <div className="mb-2 rounded-lg border border-kk-border-strong bg-kk-pri-bg px-3 py-2 text-xs text-kk-pri-text">
          Editing held order: <span className="font-semibold">{heldOrderName}</span>
        </div>
      )}
      {hasRedeemableLines && prepaidLabel ? (
        <div className="mb-2 rounded-lg border border-kk-border-strong bg-kk-pri-bg px-3 py-2 text-xs text-kk-pri-text">
          Redeeming: <span className="font-semibold">{prepaidLabel}</span>
        </div>
      ) : null}
      {hasSubscriptionSaleLines ? (
        <div className="mb-2 rounded-lg border border-kk-border-strong bg-kk-pri-bg px-3 py-2 text-xs text-kk-pri-text">
          Selling subscription plan(s). Customer selection is required at checkout.
        </div>
      ) : null}

      {/* Lines */}
      <div className="flex-1 min-h-0 space-y-2 overflow-auto py-3">
        {displayLines.length === 0 ? (
          <div className="flex flex-col gap-2 items-center rounded border border-dashed border-kk-border-strong bg-kk-pri-bg p-4 text-center text-xs text-kk-ter-text">
            <ShoppingCart className="w-7 h-7" />
            Cart is empty. Tap an item to add it.
          </div>
        ) : (
          displayLines.map((line) => {
            const { unitPrice, lineTotal } = computeLineTotals(line);
            const lineDiscount = lineDiscounts?.[line.id] ?? 0;
            const isPromo = Boolean(line.promo);

            return (
              <div
                key={line.id}
                className="flex flex-col gap-1 rounded-lg bg-kk-pri-bg p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-kk-pri-text">
                      {line.item.name}
                      {isPromo && (
                        <span className="ml-2 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                          Promo
                        </span>
                      )}
                    </div>
                    {line.item.sku && (
                      <div className="text-[11px] text-kk-sec-text">
                        SKU: {line.item.sku}
                      </div>
                    )}

                    {line.customizations?.length &&
                    line.item.customizations?.length ? (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-kk-sec-text">
                        {line.customizations.map((sel) => {
                          const meta = line.item.customizations!.find(
                            (c) => c.id === sel.customizationId
                          );
                          if (!meta || sel.quantity <= 0) return null;
                          return (
                            <li key={sel.customizationId}>
                              {meta.label} x {sel.quantity}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>

                  <div className="text-right text-sm font-semibold text-kk-pri-text">
                    {formatMoney(lineTotal - lineDiscount)}
                  </div>
                </div>

                {lineDiscount > 0 && (
                  <div className="flex justify-between text-[11px] text-kk-err">
                    <span>Discount applied</span>
                    <span>-{formatMoney(lineDiscount)}</span>
                  </div>
                )}

                <div className="mt-1 flex items-center justify-between text-xs text-kk-sec-text">
                  <span>{formatMoney(unitPrice)} each</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPromo}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-kk-border-strong text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => onChangeQty(line.id, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold text-kk-pri-text/90">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={isPromo}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-kk-border-strong text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => onChangeQty(line.id, +1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      disabled={isPromo}
                      className="ml-2 text-xs text-kk-err cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => onRemoveLine(line.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary / actions */}
      <div className="shrink-0 space-y-3 border-t border-kk-border-strong pt-3">
        {/* TODO: check permission "Coupons" "edit" for manual coupon input */}
        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-kk-pri-bg text-kk-pri-text disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowApplyDiscount(true)}
            disabled={hasRedeemableLines || hasSubscriptionSaleLines}
            title="Apply Discount"
          >
            <Percent className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-kk-pri-bg text-kk-pri-text disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowRedeemItems(true)}
            disabled={hasSubscriptionSaleLines}
            title="Redeem Items"
          >
            <Ticket className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border bg-kk-pri-bg py-2 text-[11px] font-medium text-kk-err disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              hasRedeemableLines ||
              hasSubscriptionSaleLines ||
              displayLines.length === 0 ||
              !manualCouponCodes.length
            }
            onClick={onRemoveDiscount}
            title={manualCouponCodes.length ? "Remove scanned coupon(s)" : "No scanned coupon to remove"}
          >
            <span>x</span>
            <span>Remove Discount</span>
          </button>
        </div>

        {assignedCustomerLabel ? (
          <div className="rounded-lg border border-kk-border-strong bg-kk-pri-bg px-3 py-2 text-xs text-kk-pri-text">
            Assigned customer: <span className="font-semibold">{assignedCustomerLabel}</span>
          </div>
        ) : null}

        <div className="space-y-1 text-sm text-kk-sec-text">
          <div className="flex justify-between">
            <span>
              Subtotal ({displayLines.length} item{displayLines.length === 1 ? "" : "s"})
            </span>
            <SlotAnimatedValue value={formatMoney(subtotal)} className="text-kk-pri-text/90" />
          </div>
          <div className="flex justify-between">
            <span>VAT (7.5%)</span>
            <SlotAnimatedValue value={formatMoney(taxTotal)} className="text-kk-pri-text/90" />
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-kk-err">
              <span>
                {appliedCouponNames.length
                  ? `Coupon${appliedCouponNames.length > 1 ? "s" : ""} (${appliedCouponNames.join(", ")})`
                  : "Discount"}
              </span>
              <SlotAnimatedValue value={`-${formatMoney(discountTotal)}`} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-lg font-semibold text-kk-pri-text">
          <span>Total</span>
          <SlotAnimatedValue value={formatMoney(grandTotal)} />
        </div>

        <button
          type="button"
          className="mt-1 w-full rounded-lg bg-kk-acc py-2 text-base text-kk-sec-bg 
                      font-semibold hover:bg-kk-hover cursor-pointer disabled:cursor-not-allowed 
                      disabled:hover:bg-kk-acc flex justify-center items-center gap-3
                       transition-all duration-300"
          disabled={displayLines.length === 0}
          onClick={() => {
            if (isPrepaidRedeem) {
              setRedeemError(null);
              setShowRedeemConfirm(true);
              return;
            }
            setShowProcessPayment(true);
          }}
        >
          <CreditCard className="w-6 h-6" />
          {isPrepaidRedeem ? "Redeem Items" : "Process Payment"}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-kk-border-strong bg-kk-pri-bg py-2 
                        text-sm font-medium text-kk-pri-text flex justify-center items-center 
                        gap-3 cursor-pointer hover:bg-kk-border transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={onHoldOrder}
            disabled={holding || hasRedeemableLines || hasSubscriptionSaleLines}
          >
            <StretchVertical className="w-5 h-5" />
            {holdOrderLabel}
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-kk-sec-bg
                        flex justify-center items-center gap-3  transition-all duration-300 
                        cursor-pointer hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={onClearAction}
            disabled={holding}
          >
            <Trash2 className="w-6 h-6" />
            {clearCartLabel}
          </button>
        </div>

      </div>

      {!isPrepaidRedeem ? (
        <ProcessPaymentModal
          isOpen={showProcessPayment}
          locationId={locationId}
          cart={payableLines}
          appliedCoupons={appliedCoupons}
          customerId={assignedCustomerId}
          portalCustomerId={assignedPortalCustomerId}
          onClose={() => setShowProcessPayment(false)}
          onPaymentCompleted={handlePaymentCompleted}
        />
      ) : null}

      <ReceiptModal
        isOpen={!!receiptInvoice}
        invoice={receiptInvoice}
        appliedCouponNames={receiptCouponNames}
        onClose={() => {
          setReceiptInvoice(null);
          setReceiptCouponNames([]);
        }}
        onPrint={() => window.print()}
      />

      <ScanCodeModal
        isOpen={showApplyDiscount}
        title="Apply Discount"
        subtitle="Please scan discount QR code"
        onClose={() => setShowApplyDiscount(false)}
        onCode={onApplyDiscountCode}
      />

      <ScanCodeModal
        isOpen={showAssignCustomer}
        title="Assign Customer"
        subtitle="Please scan customer QR code"
        onClose={() => setShowAssignCustomer(false)}
        onCode={onAssignCustomerCode}
      />

      <ScanCodeModal
        isOpen={showRedeemItems}
        title="Redeem Items"
        subtitle="Please scan redeemable item QR code"
        onClose={() => setShowRedeemItems(false)}
        onCode={onRedeemItemsCode}
      />

      {showRedeemConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-kk-border-strong/60">
          <div className="w-full max-w-md rounded-2xl bg-kk-pri-bg p-5 shadow-xl">
            <div className="mb-2 text-lg font-semibold text-kk-pri-text">Confirm Item Redemption</div>
            {prepaidLabel ? (
              <p className="text-sm text-kk-sec-text">
                Redeeming: <span className="font-medium">{prepaidLabel}</span>
              </p>
            ) : null}
            <p className="mt-1 text-sm text-kk-sec-text">
              {isPartialRedeem
                ? "Some redeemable quantities were removed. This will partially redeem the selected items."
                : "This will redeem all currently loaded redeemable items."}
            </p>

            {redeemError ? <p className="mt-3 text-xs font-medium text-kk-err">{redeemError}</p> : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md border border-kk-border-strong px-3 py-2 text-sm font-medium text-kk-pri-text cursor-pointer disabled:opacity-60"
                onClick={() => setShowRedeemConfirm(false)}
                disabled={redeemSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-md bg-kk-acc px-3 py-2 text-sm font-semibold text-kk-pri-bg cursor-pointer disabled:opacity-60"
                disabled={redeemSubmitting}
                onClick={async () => {
                  if (!onRedeemPrepaidInvoice) return;
                  setRedeemError(null);
                  setRedeemSubmitting(true);
                  try {
                    const result = await onRedeemPrepaidInvoice();
                    if (!result.ok) {
                      setRedeemError(result.error || "Unable to redeem items.");
                      return;
                    }
                    setShowRedeemConfirm(false);
                  } finally {
                    setRedeemSubmitting(false);
                  }
                }}
              >
                {redeemSubmitting
                  ? "Processing..."
                  : isPartialRedeem
                  ? "Partially Redeem"
                  : "Redeem"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
