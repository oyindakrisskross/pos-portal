// src/components/ReceiptModal.tsx

import React from "react";
import { formatMoney } from "../helpers/posHelpers";
import type { InvoiceResponse } from "../types/invoice";

interface ReceiptModalProps {
  isOpen: boolean;
  invoice: InvoiceResponse | null;
  onClose: () => void;
  onPrint?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  invoice,
  onClose,
  onPrint,
}) => {
  if (!isOpen || !invoice) return null;

  const topLevelItems = invoice.items.filter((ln) => ln.parent_line === null);
  const payments = invoice.payments;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-6 no-print">
          <h2 className="text-xl tracking-wide font-semibold text-kk-pri-text">Receipt</h2>
          <button
            type="button"
            className="text-xl leading-none text-kk-ter-text hover:text-kk-sec-text cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div id="receipt-print-area" className="flex-1 overflow-y-auto px-10 py-4 text-sm font-mono">
          {/* Store header */}
          <div className="mb-4 text-center">
            <h3 className="text-xl font-bold tracking-wide">KRISS KROSS</h3>
            <p className="text-xs text-gray-600">
              Skating Rink
              <br />
              Lagos, Nigeria
              <br />
              {/* Phone: +234 XXX XXX XXXX */}
            </p>
          </div>

          <hr className="my-5 text-kk-border-strong" />

          {/* Meta */}
          <div className="mb-3 grid grid-cols-2 text-xs tracking-wide text-kk-pri-text">
            <span className="font-semibold">Receipt #:</span>
            <span className="text-right">{invoice.number}</span>

            <span className="font-semibold">Date/Time:</span>
            <span className="text-right">{new Date(invoice.invoice_date).toLocaleString()}</span>

            <span className="font-semibold">Cashier:</span> 
            <span className="text-right">{invoice.created_by_name}</span>

            <span className="font-semibold">Office:</span>
            <span className="text-right">{invoice.location_name}</span>
          </div>

          <hr className="my-5 text-kk-border-strong" />

          {/* Line items */}
          {topLevelItems.map((ln: any) => (
            <div key={ln.id} className="mb-2 text-sm">
              <div className="flex justify-between">
                <span>{ln.description || ln.item_name}</span>
                <span>{formatMoney(ln.line_total)}</span>
              </div>
              <div className="ml-4 text-xs text-kk-pri-text">
                {ln.quantity} × {formatMoney(ln.unit_price)}
              </div>
              {parseFloat(ln.discount_amount ?? "0") > 0 && (
                <div className="ml-4 flex justify-between text-xs text-kk-err">
                  <span>Discount</span>
                  <span>-{formatMoney(ln.discount_amount)}</span>
                </div>
              )}
              {ln.children &&
                ln.children.map((child: any) => (
                  <div
                    key={child.id}
                    className="ml-6 flex justify-between text-xs text-kk-pri-text"
                  >
                    <span>
                      - {" "} 
                      {child.customization_label 
                      ? child.customization_label
                      : child.item_name}
                    </span>
                    <span>{formatMoney(child.line_total)}</span>
                  </div>
                ))}
              {ln.children &&
                ln.children.map((child: any) =>
                  parseFloat(child.discount_amount ?? "0") > 0 ? (
                    <div
                      key={`disc-${child.id}`}
                      className="ml-6 flex justify-between text-[10px] text-kk-err"
                    >
                      <span>Discount</span>
                      <span>-{formatMoney(child.discount_amount)}</span>
                    </div>
                  ) : null
                )}
            </div>
          ))}

          <hr className="my-5 text-kk-border-strong" />

          {/* Totals */}
          <div className="space-y-1 text-xs text-kk-pri-text">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT (7.5%):</span>
              <span>{formatMoney(invoice.tax_total)}</span>
            </div>
            {parseFloat(invoice.discount_total ?? "0") > 0 && (
              <>
                <div className="flex justify-between text-kk-err">
                  <span>Discount:</span>
                  <span>-{formatMoney(invoice.discount_total)}</span>
                </div>
                {invoice.coupon_code && (
                  <div className="text-[10px] text-kk-sec-text">
                    Code: {invoice.coupon_code}
                  </div>
                )}
              </>
            )}
            <div className="mt-2 flex justify-between text-base font-semibold">
              <span>TOTAL:</span>
              <span>{formatMoney(invoice.grand_total)}</span>
            </div>
          </div>

          <hr className="my-5 text-kk-border-strong" />

          {/* Payments */}
          <div className="space-y-1 text-xs text-kk-pri-text">
            <div className="flex justify-between">
              <span>Payment Method:</span>
              <span>
                {payments.map((p: any) => p.method).join(", ") || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span>{formatMoney(invoice.amount_paid)}</span>
            </div>
          </div>

          <hr className="my-5 text-kk-border-strong" />

          {/* Thank-you + QR placeholder */}
          <div className="mb-4 text-center text-xs text-kk-pri-text">
            <p>Thank you for your visit!</p>
            <p>Please keep this receipt for your records</p>
          </div>

          {/* TODO: PHase 2 */}
          {/* <div className="mb-4 rounded-xl border border-dashed border-kk-border-strong 
                        bg-kk-sec-bg px-4 py-6 text-center text-xs">
            <div className="mb-2 font-semibold">QR Code</div>
            <div className="mb-2 rounded
                              py-6 text-[11px] text-kk-ter-text flex justify-center">
              <QRCode
                value={String(invoice.number)}          // or a URL with the invoice number
                size={102}
                bgColor="transparent"
                fgColor="#000000"
              />
            </div>
            <div>Scan for digital receipt</div>
          </div> */}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-4 border-t border-kk-border px-6 py-4 no-print">
          <button
            type="button"
            className="flex-1 rounded-lg border border-kk-border-strong px-4 py-2 
                        text-sm font-medium text-kk-sec-text cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-kk-acc px-4 py-2 text-sm font-semibold 
                      text-kk-pri-bg hover:bg-kk-hover transition-all duration-300 cursor-pointer"
            onClick={() => {
              if (onPrint) return onPrint();
              window.print();
            }}
          >
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
