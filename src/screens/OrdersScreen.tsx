// src/screens/OrdersScreen.tsx

import React, { useEffect, useState } from "react";
import type { InvoiceResponse } from "../types/invoice";
import { OrderCard } from "../components/OrderCard";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { ReceiptModal } from "../components/ReceiptModal";
import { fetchOrders } from "../api/invoice";

interface OrdersScreenProps {
  locationId: number;
  cashierName: string;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  locationId,
  cashierName,
}) => {
  const [orders, setOrders] = useState<InvoiceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<InvoiceResponse | null>(
    null
  );
  const [receiptInvoice, setReceiptInvoice] = useState<InvoiceResponse | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const getCashierOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchOrders({
          location_id: locationId,
          status: "PAID",
          mine: 1,
          today: 1,
          search: search.trim() || undefined,
        });
        
        if (!cancelled) {
          setOrders(data.results);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Unable to load orders.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    getCashierOrders();
    return () => {
      cancelled = true;
    };
  }, [locationId, search]);

  const handlePrintReceipt = (invoice: InvoiceResponse) => {
    setReceiptInvoice(invoice);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-kk-pri-bg">
      {/* Top Header */}
      <header className="flex text-kk-pri-text items-center justify-between border-b border-kk-border px-6 py-3">
        <h1 className="text-lg font-bold tracking-wide">
          ORDERS
        </h1>
        {/* <div className="text-right text-xs text-gray-600">
          <div className="font-semibold">{timeLabel}</div>
          <div>{dateLabel}</div>
        </div> */}
      </header>

      {/* search / filter bar */}
      <div className="flex items-center gap-3 bg-kk-pri-bg px-6 py-3">
        {/* <button className="rounded-lg border px-3 py-2 text-xs">Filter</button>
        <button className="rounded-lg border px-3 py-2 text-xs">List</button> */}

        <div className="ml-4 flex-1">
          <input
            type="text"
            className="w-full rounded-md border border-kk-border-strong bg-kk-sec-bg px-4 py-2 text-xs"
            placeholder="Enter or Scan Order Number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && (
          <div className="text-center text-xs text-kk-ter-text">
            Loading orders…
          </div>
        )}
        {error && !loading && (
          <div className="text-center text-xs text-red-600">{error}</div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="mt-12 text-center text-sm text-kk-ter-text">
            There are no orders yet.
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-1">
            {orders.map((inv) => (
              <OrderCard
                key={inv.id}
                invoice={inv}
                cashierName={inv.created_by_name || cashierName}
                onSeeDetails={() => setSelectedOrder(inv)}
                onPrint={() => handlePrintReceipt(inv)}
              />
            ))}
          </div>
        )}
      </div>

      <OrderDetailModal
        isOpen={!!selectedOrder}
        invoice={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onPrint={handlePrintReceipt}
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
