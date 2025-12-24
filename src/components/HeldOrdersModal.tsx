// src/components/HeldOrdersModal.tsx

import React, { useEffect, useState } from "react";
import type { AddToCartPayload, HeldOrderSummary } from "../types/catalog";

interface HeldOrdersModalProps {
  isOpen: boolean;
  locationId: number;
  onClose: () => void;

  /**
   * Fetch list of held orders for this location.
   * You implement this using your own backend.
   */
  fetchHeldOrders: (locationId: number) => Promise<HeldOrderSummary[]>;

  /**
   * Given a held-order id, load it and convert it into
   * an array of AddToCartPayloads suitable for your cart state.
   */
  loadHeldOrder: (heldOrderId: number) => Promise<AddToCartPayload[]>;

  /**
   * Replace current cart with the loaded held order.
   */
  onReplaceCart: (lines: AddToCartPayload[]) => void;
}


export const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({
  isOpen,
  locationId,
  onClose,
  fetchHeldOrders,
  loadHeldOrder,
  onReplaceCart,
}) => {
  const [orders, setOrders] = useState<HeldOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHeldOrders(locationId)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load held orders.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, locationId, fetchHeldOrders]);

  if (!isOpen) return null;

  const handleResume = async (orderId: number) => {
    try {
      setLoadingOrderId(orderId);
      const lines = await loadHeldOrder(orderId);
      onReplaceCart(lines);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to load held order.");
    } finally {
      setLoadingOrderId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="w-full max-w-md rounded-xl bg-kk-pri-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-6">
          <h2 className="text-xl tracking-wide font-semibold text-kk-pri-text">
            Held Orders
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
        <div className="max-h-[70vh] overflow-y-auto px-5 py-3 space-y-3">
          {loading && (
            <div className="text-center text-xs text-kk-ter-text">
              Loading held orders…
            </div>
          )}

          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="rounded border border-dashed border-kk-border bg-kk-sec-bg px-3 
                py-4 text-center text-xs text-kk-sec-text">
              No held orders for this location.
            </div>
          )}

          {orders.map((order) => {
            const created = new Date(order.created_at);
            const dateLabel = created.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            const timeLabel = created.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });

            const isLoadingThis = loadingOrderId === order.id;

            return (
              <button
                key={order.id}
                type="button"
                className="flex w-full flex-col items-stretch rounded-lg border border-kk-border 
                    bg-kk-pri-bg p-3 text-left text-base hover:border-kk-acc hover:bg-kk-acc/10
                    cursor-pointer"
                onClick={() => handleResume(order.id)}
                disabled={isLoadingThis}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-semibold text-kk-pri-text">
                      Order #{order.id}
                    </span>
                    <span className="text-[11px] text-kk-ter-text">
                      {dateLabel} · {timeLabel}
                    </span>
                  </div>
                  <div className="text-right">
                    {/* <div className="text-sm font-semibold text-gray-900">
                      {formatMoney(order.total)}
                    </div> */}
                    <div className="text-[11px] text-kk-ter-text">
                      {order.items.length} item
                      {order.items.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {isLoadingThis && (
                  <div className="mt-2 text-[11px] text-kk-acc">
                    Loading…
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-kk-border mt-3 px-5 py-3">
          <button
            type="button"
            className="w-full rounded-md border border-kk-border-strong 
              px-4 py-2 text-sm font-medium text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
