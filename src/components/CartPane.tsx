// src/components/CartPane.tsx

import React, { useState } from "react";
import type { CartLine, CartPricingSummary } from "../types/catalog";
import { computeLineTotals, formatMoney } from "../helpers/posHelpers";
import { ProcessPaymentModal } from "./ProcessPaymentModal";
import { ReceiptModal } from "./ReceiptModal";
import type { InvoiceResponse } from "../types/invoice";
import { CreditCard, ShoppingCart, StretchVertical, Trash2 } from "lucide-react";


interface CartPaneProps {
  lines: CartLine[];
  pricing: CartPricingSummary | null;
  onChangeQty: (lineId: string, delta: number) => void;
  onRemoveLine: (lineId: string) => void;
  onClearCart: () => void;
  // We’ll keep "Apply Discount" simple for now – can expand later
  onApplyDiscount?: () => void;
  onHoldOrder?: () => void;
  locationId: number;
}

export const CartPane: React.FC<CartPaneProps> = ({
  lines,
  pricing,
  onChangeQty,
  onRemoveLine,
  onClearCart,
  onHoldOrder,
  locationId,
}) => {
  const [showProcessPayment, setShowProcessPayment] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<InvoiceResponse | null>(null);

  const subtotal = pricing?.subtotal ?? 0;
  const taxTotal = pricing?.taxTotal ?? 0;
  // const discountTotal = pricing?.discountTotal ?? 0;
  const grandTotal = pricing?.grandTotal ?? 0;

  const handlePaymentCompleted = (invoice: InvoiceResponse) => {
    setShowProcessPayment(false);
    setReceiptInvoice(invoice);
    onClearCart();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Lines */}
      <div className="flex-1 space-y-2 overflow-auto py-3">
        {lines.length === 0 ? (
          <div className="flex flex-col gap-2 items-center rounded border border-dashed border-kk-border-strong bg-kk-pri-bg p-4 text-center text-xs text-kk-ter-text">
            <ShoppingCart className="w-7 h-7" />
            Cart is empty. Tap an item to add it.
          </div>
        ) : (
          lines.map((line) => {
            const { unitPrice, lineTotal } = computeLineTotals(line);

            return (
              <div
                key={line.id}
                className="flex flex-col gap-1 rounded-lg bg-kk-pri-bg p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-kk-pri-text">
                      {line.item.name}
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
                              {meta.label} × {sel.quantity}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>

                  <div className="text-right text-sm font-semibold text-kk-pri-text">
                    {formatMoney(lineTotal)}
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-kk-sec-text">
                  <span>{formatMoney(unitPrice)} each</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-kk-border-strong text-xs cursor-pointer"
                      onClick={() => onChangeQty(line.id, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold text-kk-pri-text/90">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-kk-border-strong text-xs cursor-pointer"
                      onClick={() => onChangeQty(line.id, +1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-xs text-kk-err cursor-pointer"
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
      <div className="space-y-3 border-t border-kk-border-strong pt-3 h-2/5">
        {/* TODO: check permission "Coupons" "edit" for manual coupon input */}
        {/* <button
          disabled
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border bg-kk-pri-bg py-2 text-[11px] font-medium text-gray-800"
          onClick={onApplyDiscount}
        >
          <span>%</span>
          <span>Apply Discount</span>
        </button> */}

        <div className="space-y-1 text-sm text-kk-sec-text">
          <div className="flex justify-between">
            <span>
              Subtotal ({lines.length} item{lines.length === 1 ? "" : "s"})
            </span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT (7.5%)</span>
            <span>{formatMoney(taxTotal)}</span>
          </div>
          {/* TODO: Discount Logic, Phase 2 */}
          {/* {discountTotal > 0 && (
            <div className="flex justify-between text-kk-err">
              <span>Discount</span>
              <span>-{formatMoney(discountTotal)}</span>
            </div>
          )} */}
        </div>

        <div className="flex items-center justify-between text-lg font-semibold text-kk-pri-text">
          <span>Total</span>
          <span>{formatMoney(grandTotal)}</span>
        </div>

        <button
          type="button"
          className="mt-1 w-full rounded-lg bg-kk-acc py-2 text-base text-kk-sec-bg 
                      font-semibold hover:bg-kk-hover cursor-pointer disabled:cursor-not-allowed 
                      disabled:hover:bg-kk-acc flex justify-center items-center gap-3
                       transition-all duration-300"
          disabled={lines.length === 0}
          onClick={() => setShowProcessPayment(true)}
        >
          <CreditCard className="w-6 h-6" />
          Process Payment
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-kk-border-strong bg-kk-pri-bg py-2 
                        text-sm font-medium text-kk-pri-text flex justify-center items-center 
                        gap-3 cursor-pointer hover:bg-kk-border transition-all duration-300"
            onClick={onHoldOrder}
          >
            <StretchVertical className="w-5 h-5" />
            Hold Order
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-kk-sec-bg
                        flex justify-center items-center gap-3  transition-all duration-300 
                        cursor-pointer hover:bg-red-600"
            onClick={onClearCart}
          >
            <Trash2 className="w-6 h-6" />
            Clear Cart
          </button>
        </div>
      </div>

      <ProcessPaymentModal
        isOpen={showProcessPayment}
        locationId={locationId}
        cart={lines}
        onClose={() => setShowProcessPayment(false)}
        onPaymentCompleted={handlePaymentCompleted}
      />

      <ReceiptModal
        isOpen={!!receiptInvoice}
        invoice={receiptInvoice}
        onClose={() => setReceiptInvoice(null)}
        onPrint={() => window.print()}
      />
    </div>
  );
};
