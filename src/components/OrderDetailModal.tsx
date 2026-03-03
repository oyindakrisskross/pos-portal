// src/components/OrderDetailModal.tsx

import React from "react";
import type { InvoiceResponse } from "../types/invoice";
import { formatMoney } from "../helpers/posHelpers";

interface OrderDetailModalProps {
  isOpen: boolean;
  invoice: InvoiceResponse | null;
  onClose: () => void;
  onPrint: (invoice: InvoiceResponse) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  invoice,
  onClose,
  onPrint,
}) => {
  if (!isOpen || !invoice) return null;

  const createdAt = new Date(invoice.invoice_date);
  const dateStr = createdAt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = createdAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const parentLines = invoice.items.filter((ln) => ln.parent_line === null);
  const couponCodes = (invoice.coupon_codes?.length ? invoice.coupon_codes : invoice.coupon_code ? [invoice.coupon_code] : []).filter(Boolean);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-kk-border-strong/60">
      <div className="flex max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-kk-pri-bg shadow-xl">
        {/* left: order content */}
        <div className="flex flex-1 flex-col border-r border-kk-border bg-kk-sec-bg">
          <div className="flex items-end justify-between px-6 py-4">
            <div className="flex items-baseline gap-2">
              <div className="text-xl font-bold">#{invoice.number}</div>
            </div>
            <div className="text-xs text-kk-sec-text ">
              Cashier : {invoice.created_by_name}
            </div>
          </div>

          <div className="border-t border-kk-border px-6 py-5 text-[11px] text-kk-sec-text">
            <div className="mb-4 flex justify-between">
              <span>{dateStr}</span>
              <span>{timeStr}</span>
            </div>

            <div className="mb-2 grid grid-cols-4 justify-between text-xs font-semibold text-kk-pri-text">
              <span className="col-span-2">Item</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Price</span>
            </div>

            {parentLines.map((ln) => (
              <div key={ln.id} className="mb-2">
                <div className="grid grid-cols-4 justify-between text-[11px]">
                  <span className="col-span-2">
                    {ln.description || ln.item_name}
                  </span>
                  <span className="text-center">{ln.quantity}</span>
                  <span className="text-right">
                    {formatMoney(ln.line_total)}
                  </span>
                </div>
                {parseFloat(ln.discount_amount ?? "0") > 0 && (
                  <div className="ml-1 mt-0.5 flex justify-between text-[10px] text-kk-err">
                    <span className="w-1/3">Discount</span>
                    <span className="text-right">-{formatMoney(ln.discount_amount)}</span>
                  </div>
                )}
                {ln.children.map((child) => (
                  <React.Fragment key={child.id}>
                    <div className="ml-4 flex justify-between text-[10px] text-kk-sec-text">
                      <span className="w-1/3">
                        -{" "}
                        {child.customization_label || child.item_name}
                      </span>
                      <span className="text-center">{child.quantity}</span>
                      <span className="text-right">{formatMoney(child.line_total)}</span>
                    </div>
                    {parseFloat(child.discount_amount ?? "0") > 0 && (
                      <div className="ml-6 flex justify-between text-[10px] text-kk-err">
                        <span className="w-1/3">Discount</span>
                        <span className="text-right">-{formatMoney(child.discount_amount)}</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ))}

            <div className="mt-4 border-t border-kk-border-strong pt-3 text-xs text-kk-pri-text">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (7.5% VAT)</span>
                <span>{formatMoney(invoice.tax_total)}</span>
              </div>
              {parseFloat(invoice.discount_total ?? "0") > 0 && (
                <>
                  <div className="flex justify-between text-kk-err">
                    <span>Discount</span>
                    <span>-{formatMoney(invoice.discount_total)}</span>
                  </div>
                  {couponCodes.length > 0 && (
                    <div className="text-[10px] text-kk-sec-text">
                      Code{couponCodes.length > 1 ? "s" : ""}: {couponCodes.join(", ")}
                    </div>
                  )}
                </>
              )}
              <div className="mt-2 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatMoney(invoice.grand_total)}</span>
              </div>
            </div>

            <div className="mt-3 border-t border-kk-border-strong pt-3 text-[11px] text-kk-pri-text">
              <div className="flex justify-between">
                <span>Payment Method</span>
                <span>
                  {invoice.payments.map((p) => p.method).join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* right: action buttons */}
        <div className="flex w-56 flex-col justify-between bg-kk-pri-bg px-4 py-4">
          <div className="space-y-3">
            <button
              type="button"
              className="w-full rounded-md bg-kk-acc px-3 py-2 text-sm cursor-pointer 
                  font-semibold text-kk-pri-bg"
              onClick={() => onPrint(invoice)}
            >
              Print Receipt
            </button>

            {/* future actions: email, refund, etc. */}

            {/* <button
              type="button"
              className="w-full rounded-md border px-3 py-2 text-sm font-medium cursor-pointer
                 text-kk-pri-text border-kk-border-strong"
              onClick={onClose}
            >
              Cancel
            </button> */}
          </div>

          <button
            type="button"
            className="mt-6 w-full rounded-md border border-kk-border-strong px-3 py-2 text-xs font-medium 
                text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
