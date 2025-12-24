// src/components/OrderCard.tsx

import React from "react";
import type { InvoiceResponse } from "../types/invoice";
import { formatMoney } from "../helpers/posHelpers";

interface OrderCardProps {
  invoice: InvoiceResponse;
  cashierName: string;
  onSeeDetails: () => void;
  onPrint: () => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  invoice,
  cashierName,
  onSeeDetails,
  onPrint,
}) => {
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
  const visible = parentLines.slice(0, 3);
  const hiddenCount = parentLines.length - visible.length;

  return (
    <div className="flex flex-col rounded-xl bg-kk-pri-bg shadow-md">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <div className="text-base font-semibold">#{invoice.number}</div>
        </div>
        <div className="text-xs text-kk-ter-text">
          Cashier : {cashierName}
        </div>
      </div>

      <div className="px-4 pt-2 text-[10px] text-kk-ter-text">
        <div className="flex justify-between">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
      </div>

      <div className="mt-2 h-full border-t px-4 pt-2 text-[10px] text-kk-ter-text">
        <div className="mb-1 grid grid-cols-4 justify-between font-semibold text-kk-pri-text">
          <span className="col-span-2">Items</span>
          <span>Qty</span>
          <span>Price</span>
        </div>

        {visible.map((ln) => (
          <div key={ln.id} className="mb-1 grid grid-cols-4 justify-between">
            <span className="w-4/5 truncate col-span-2">
              {ln.description || ln.item_name}
            </span>
            <span className="w-1/6 text-center">{ln.quantity}</span>
            <span className="w-1/3 text-right">
              {formatMoney(ln.line_total)}
            </span>
          </div>
        ))}

        {hiddenCount > 0 && (
          <div className="mt-1 text-[10px] text-kk-ter-text/80">
            + {hiddenCount} more
          </div>
        )}
      </div>

      <div className="mt-2 border-t px-4 py-2 text-sm text-kk-pri-text">
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatMoney(invoice.grand_total)}</span>
        </div>
      </div>

      <div className="flex gap-2 border-t px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={onSeeDetails}
          className="flex-1 rounded-md border border-kk-border-strong bg-kk-sec-bg 
              px-3 py-1 text-[11px] font-medium text-kk-pri-text cursor-pointer"
        >
          See Details
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-md bg-kk-acc px-3 py-1 text-[11px] font-medium 
              text-kk-pri-bg cursor-pointer"
        >
          Print Receipt
        </button>
      </div>
    </div>
  );
};
