// src/screens/layout/AppShell.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PosScreen } from "../PosScreen";
import type { 
  AddToCartPayload, 
  CartLine, 
  CartPricingSummary, 
  HeldOrderSummary, 
} from "../../types/catalog";
import { CartPane } from "../../components/CartPane";
import {
  cancelHeldOrder,
  completeHeldOrder,
  createHoldCart,
  fetchHeldOrders,
  fetchPriceCart,
  loadHeldOrder,
  updateHoldCart,
} from "../../api/cart";
import { HeldOrdersModal } from "../../components/HeldOrdersModal";
import { HoldOrderNameModal } from "../../components/HoldOrderNameModal";
import { fetchPOSItem } from "../../api/catalog";
import { OrdersScreen } from "../OrdersScreen";
import { Ellipsis, LogOut, ReceiptText, Store, StretchVertical } from "lucide-react";
import { SidebarItem } from "../../components/SideBarItem";
import { useAuth } from "../../auth/AuthContext";
import type { AppliedCoupon } from "../../types/invoice";
import { parseDecimal } from "../../helpers/posHelpers";
import { fetchOutlets } from "../../api/auth";


function makeLineId(counter: number) {
  // simple deterministic id – good enough for now
  return `${Date.now()}-${counter}`;
}

type ViewKey = "POS" | "ORDERS" | "HOLD";

interface Props {
  locationId: number;
  cashierName: string;
}

export const PosApp: React.FC<Props> = ({
  locationId,
  cashierName,
}) => {
  const { logout } = useAuth();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [promoLines, setPromoLines] = useState<CartLine[]>([]);
  const [pricing, setPricing] = useState<CartPricingSummary | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [manualCouponCode, setManualCouponCode] = useState<string>("");
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, number>>({});
  const [heldOpen, setHeldOpen] = useState(false);
  const [activeHeldOrder, setActiveHeldOrder] = useState<{ id: number; customer_name: string } | null>(null);
  const [holdNameOpen, setHoldNameOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("POS");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [locationName, setLocationName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!locationId) {
        setLocationName("");
        return;
      }

      const outlets = await fetchOutlets();
      if (cancelled) return;
      const match = outlets.find((o) => o.id === locationId);
      setLocationName(match?.name ?? `Location #${locationId}`);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const buildPriceCartPayload = (cartLines: CartLine[]) => {
    const itemsPayload: any[] = [];
    const payloadToCartLine: string[] = [];

    for (let parentIdx = 0; parentIdx < cartLines.length; parentIdx++) {
      const line = cartLines[parentIdx];
      const parent = line.item;
      itemsPayload.push({
        item: parent.id,
        quantity: line.quantity,
        unit_price: parent.price,
        parent_idx: parentIdx,
        is_child: false,
      });
      payloadToCartLine.push(line.id);

      if (line.customizations?.length && parent.customizations?.length) {
        const metaById = new Map(parent.customizations.map((c) => [c.id, c]));

        for (const sel of line.customizations) {
          const meta = metaById.get(sel.customizationId);
          if (!meta || sel.quantity <= 0) continue;

          const delta = parseFloat(meta.price_delta || "0") || 0;
          if (!delta) continue;

          const effectiveQty = sel.quantity * line.quantity;

          let unitPrice = delta;
          if (meta.pricing_type === "DISCOUNT") {
            unitPrice = -Math.abs(delta);
          } else if (meta.pricing_type === "INCLUDED") {
            unitPrice = 0;
          }

          itemsPayload.push({
            item: meta.child,
            quantity: effectiveQty,
            unit_price: unitPrice.toString(),
            parent_idx: parentIdx,
            is_child: true,
          });
          payloadToCartLine.push(line.id);
        }
      }
    }

    return { itemsPayload, payloadToCartLine };
  };

  const applyPriceCartResponse = async (
    data: any,
    payloadToCartLine: string[],
    cartLines: CartLine[]
  ) => {
    setPricing({
      subtotal: parseFloat(data.subtotal ?? "0") || 0,
      taxTotal: parseFloat(data.tax_total ?? "0") || 0,
      discountTotal: parseFloat(data.discount_total ?? "0") || 0,
      grandTotal: parseFloat(data.grand_total ?? "0") || 0,
    });

    const nextApplied = (data?.applied_coupon as AppliedCoupon) ?? null;
    setAppliedCoupon(nextApplied);

    const nextDiscounts: Record<string, number> = {};
    const pricedLines: any[] = Array.isArray(data?.lines) ? data.lines : [];
    pricedLines.forEach((ln, idx) => {
      const cartLineId = payloadToCartLine[idx];
      if (!cartLineId) return;
      const disc = parseFloat(ln?.total_discount_amount ?? "0") || 0;
      if (disc <= 0) return;
      nextDiscounts[cartLineId] = (nextDiscounts[cartLineId] ?? 0) + disc;
    });

    const bonusLines: any[] = Array.isArray(data?.bonus_lines) ? data.bonus_lines : [];
    const isBxgy = String(nextApplied?.type ?? "").toUpperCase() === "BXGY";
    if (isBxgy && bonusLines.length) {
      const promo = await Promise.all(
        bonusLines.map(async (b, idx) => {
          const itemId = Number(b?.item_id);
          const qty = Number(b?.quantity ?? 0);

          const sourceIdxRaw = b?.source_line_index;
          const sourceIdx =
            typeof sourceIdxRaw === "number" && Number.isFinite(sourceIdxRaw)
              ? sourceIdxRaw
              : null;
          const sourceCartLineId =
            sourceIdx !== null ? payloadToCartLine[sourceIdx] : null;
          const sourceLine = sourceCartLineId
            ? cartLines.find((l) => l.id === sourceCartLineId)
            : null;

          const item =
            sourceLine?.item ??
            (await fetchPOSItem(itemId, { location_id: locationId }));
          return {
            id: `promo-${nextApplied?.code ?? "bxgy"}-${itemId}-${idx}`,
            item,
            quantity: qty,
            customizations: [],
            promo: true,
          } as CartLine;
        })
      );

      setPromoLines(promo);
      promo.forEach((pl, idx) => {
        const disc = parseFloat(bonusLines[idx]?.total_discount_amount ?? "0") || 0;
        if (!disc) return;
        nextDiscounts[pl.id] = (nextDiscounts[pl.id] ?? 0) + disc;
      });
    } else {
      setPromoLines([]);
    }

    setLineDiscounts(nextDiscounts);
  };

  const handleAddToCart = (payload: AddToCartPayload) => {
    setCart((prev) => {
      if (payload.item.inventory_tracking) {
        const stockQty = parseDecimal(payload.item.stock_qty, 0);
        if (stockQty <= 0) {
          showToast(`"${payload.item.name}" is out of stock.`);
          return prev;
        }

        const alreadyInCart = prev.reduce(
          (acc, line) => (line.item.id === payload.item.id ? acc + line.quantity : acc),
          0
        );
        const nextTotal = alreadyInCart + payload.quantity;
        if (nextTotal > stockQty) {
          showToast(
            `Only ${stockQty} in stock for "${payload.item.name}". You already have ${alreadyInCart} in the cart.`
          );
          return prev;
        }
      }

      const existingIndex = prev.findIndex(
        (line) =>
          line.item.id === payload.item.id &&
          line.customizations.length === payload.customizations.length &&
          line.customizations.every(
            (c, i) =>
              c.customizationId === payload.customizations[i].customizationId &&
              c.quantity === payload.customizations[i].quantity
          )
      );

      if (existingIndex === -1) {
        return [
          ...prev,
          {
            id: makeLineId(prev.length),
            ...payload,
          },
        ];
      }

      return prev.map((line, idx) =>
        idx === existingIndex
          ? { ...line, quantity: line.quantity + payload.quantity }
          : line
      );
    });
  };

  const handleReplaceCart = (lines: AddToCartPayload[]) => {
    handleClearCart();
    lines.forEach((line) => {
      handleAddToCart(line);
    });
  };

  const listHeldOrders = useCallback(
    async (locId: number, q?: string): Promise<HeldOrderSummary[]> => {
      return await fetchHeldOrders(locId, q);
    },
    []
  );

  const getHeldOrder = useCallback(
    async (heldOrderId: number): Promise<AddToCartPayload[]> => {
      const data = await loadHeldOrder(heldOrderId);
      const rows = Array.isArray(data?.items) ? data.items : [];

      // Held payload is parent row followed by optional customization rows.
      // Rebuild cart lines from that structure instead of treating child rows as standalone products.
      const pending: Array<{
        itemId: number;
        quantity: number;
        customizations: Array<{ customizationId: number; quantity: number }>;
      }> = [];

      let currentParentIndex = -1;

      rows.forEach((row: any) => {
        const customizationIdRaw = row?.customization_id;
        const customizationId =
          customizationIdRaw === null || customizationIdRaw === undefined
            ? 0
            : Number(customizationIdRaw);

        if (customizationId > 0 && currentParentIndex >= 0) {
          const customQtyRaw = Number(row?.customization_qty ?? 0);
          const customQty = Number.isFinite(customQtyRaw) ? customQtyRaw : 0;
          if (customQty <= 0) return;

          const parent = pending[currentParentIndex];
          const existing = parent.customizations.find(
            (c) => c.customizationId === customizationId
          );
          if (existing) {
            existing.quantity += customQty;
          } else {
            parent.customizations.push({
              customizationId,
              quantity: customQty,
            });
          }
          return;
        }

        const itemId = Number(row?.item);
        const quantityRaw = Number(row?.quantity ?? 0);
        const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;

        if (!Number.isFinite(itemId) || quantity <= 0) return;

        pending.push({
          itemId,
          quantity,
          customizations: [],
        });
        currentParentIndex = pending.length - 1;
      });

      const results = await Promise.allSettled(
        pending.map(async (line): Promise<AddToCartPayload> => {
          const item = await fetchPOSItem(line.itemId, { location_id: locationId });
          return {
            item,
            quantity: line.quantity,
            customizations: line.customizations,
          };
        })
      );

      const lines: AddToCartPayload[] = [];
      results.forEach((res) => {
        if (res.status === "fulfilled") {
          lines.push(res.value);
        }
      });

      return lines;
    },
    [locationId]
  );

  const handleResumeHeldOrder = useCallback(
    (order: HeldOrderSummary) => {
      setActiveHeldOrder({ id: order.id, customer_name: order.customer_name });
      showToast(`Resumed held order: ${order.customer_name || `#${order.id}`}`);
    },
    []
  );

  const handleChangeQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.id !== lineId) return line;
          if (delta <= 0) {
            return { ...line, quantity: Math.max(0, line.quantity + delta) };
          }

          if (line.item.inventory_tracking) {
            const stockQty = parseDecimal(line.item.stock_qty, 0);
            if (stockQty <= 0) {
              showToast(`"${line.item.name}" is out of stock.`);
              return line;
            }

            const alreadyInCart = prev.reduce(
              (acc, l) => (l.item.id === line.item.id ? acc + l.quantity : acc),
              0
            );
            const nextTotal = alreadyInCart + delta;
            if (nextTotal > stockQty) {
              showToast(
                `Only ${stockQty} in stock for "${line.item.name}". You already have ${alreadyInCart} in the cart.`
              );
              return line;
            }
          }

          return { ...line, quantity: Math.max(0, line.quantity + delta) };
        })
        .filter((line) => line.quantity > 0)
    );
  };

  const handleRemoveLine = (lineId: string) => {
    setCart((prev) => prev.filter((line) => line.id !== lineId));
  };

  const handleClearCart = () => {
    setCart([]);
    setPromoLines([]);
    setManualCouponCode("");
  };

  const buildHoldItemsPayload = useCallback((cartLines: CartLine[]) => {
    // Build payload EXACTLY like price-cart items
    const itemsPayload: any[] = [];

    for (const line of cartLines) {
      const parent = line.item;

      itemsPayload.push({
        item: parent.id,
        quantity: line.quantity,
        unit_price: parent.price,
      });

      // Handle customizations as individual items
      if (line.customizations?.length && parent.customizations?.length) {
        const metaById = new Map(parent.customizations.map((c) => [c.id, c]));

        for (const sel of line.customizations) {
          const meta = metaById.get(sel.customizationId);
          if (!meta || sel.quantity <= 0) continue;

          const delta = parseFloat(meta.price_delta || "0") || 0;
          const effectiveQty = sel.quantity * line.quantity;

          itemsPayload.push({
            item: meta.child,
            quantity: effectiveQty,
            unit_price: delta.toString(),
            customization_id: meta.id,
            customization_qty: sel.quantity,
          });
        }
      }
    }

    return itemsPayload;
  }, []);

  const saveNewHeldOrder = async (customerName: string) => {
    if (cart.length === 0) return;
    setHolding(true);
    try {
      const itemsPayload = buildHoldItemsPayload(cart);
      await createHoldCart({
        location: locationId,
        customer_name: customerName,
        items: itemsPayload,
      });
      showToast(`Held order saved: ${customerName}`);
      handleClearCart();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to hold order.");
    } finally {
      setHolding(false);
    }
  };

  const saveExistingHeldOrder = async () => {
    if (!activeHeldOrder) return;
    if (cart.length === 0) return;

    setHolding(true);
    try {
      const itemsPayload = buildHoldItemsPayload(cart);
      await updateHoldCart(activeHeldOrder.id, {
        customer_name: activeHeldOrder.customer_name,
        items: itemsPayload,
      });
      showToast(`Held order updated: ${activeHeldOrder.customer_name}`);
      setActiveHeldOrder(null);
      handleClearCart();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to update held order.");
    } finally {
      setHolding(false);
    }
  };

  const handleCancelHeldOrder = async () => {
    if (!activeHeldOrder) {
      handleClearCart();
      return;
    }

    setHolding(true);
    try {
      await cancelHeldOrder(activeHeldOrder.id);
      showToast(`Cancelled held order: ${activeHeldOrder.customer_name}`);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to cancel held order.");
    } finally {
      setActiveHeldOrder(null);
      handleClearCart();
      setHolding(false);
    }
  };

  const handleHoldOrder = async () => {
    if (cart.length === 0 || holding) return;
    if (activeHeldOrder) {
      await saveExistingHeldOrder();
      return;
    }
    setHoldNameOpen(true);
  };

  const handleAfterPaymentCompleted = useCallback(() => {
    const current = activeHeldOrder;
    if (!current) return;

    (async () => {
      try {
        await completeHeldOrder(current.id);
      } catch (err: any) {
        showToast(err?.response?.data?.detail || "Failed to complete held order.");
      } finally {
        setActiveHeldOrder(null);
      }
    })();
  }, [activeHeldOrder, showToast]);


  const applyDiscountFromRaw = async (
    raw: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return { ok: false, error: "No code detected." };
    if (cart.length === 0) return { ok: false, error: "Cart is empty." };

    const prefixed = trimmed.match(/^([A-Z_]{2,20}):(.*)$/);
    if (prefixed) {
      const prefix = prefixed[1];
      const rest = (prefixed[2] || "").trim();
      if (prefix !== "COUPON") {
        return { ok: false, error: `Unsupported QR type: ${prefix}` };
      }
      if (!rest) return { ok: false, error: "Coupon code is missing." };
    }

    const couponCode = prefixed ? (prefixed[2] || "").trim() : trimmed;
    const { itemsPayload, payloadToCartLine } = buildPriceCartPayload(cart);

    try {
      const data = await fetchPriceCart({
        location: locationId,
        items: itemsPayload,
        coupon_code: couponCode,
      });

      const couponError = data?.coupon_error;
      if (couponError) {
        return {
          ok: false,
          error: String(couponError?.detail || "Coupon not valid."),
        };
      }

      const nextApplied = (data?.applied_coupon as AppliedCoupon) ?? null;
      if (
        !nextApplied?.code ||
        String(nextApplied.code).toUpperCase() !== couponCode.toUpperCase()
      ) {
        return { ok: false, error: "Coupon could not be applied to this cart." };
      }

      setManualCouponCode(couponCode);
      await applyPriceCartResponse(data, payloadToCartLine, cart);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Unable to apply coupon." };
    }
  };

  const handleRemoveDiscount = async () => {
    if (!manualCouponCode) return;
    setManualCouponCode("");

    if (cart.length === 0) return;

    // Re-price immediately so any auto-apply coupon can take over.
    const { itemsPayload, payloadToCartLine } = buildPriceCartPayload(cart);
    try {
      const data = await fetchPriceCart({
        location: locationId,
        items: itemsPayload,
      });
      await applyPriceCartResponse(data, payloadToCartLine, cart);
    } catch (err) {
      console.error("Error removing coupon", err);
    }
  };

  // --- Call backend PriceCartView whenever cart changes ---
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function priceCart() {
      if (cart.length === 0) {
        setPricing({
          subtotal: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 0,
        });
        setAppliedCoupon(null);
        setManualCouponCode("");
        setLineDiscounts({});
        setPromoLines([]);
        return;
      }

      // Build the payload expected by PriceCartView
      // (location + simple list of {item, quantity, unit_price})
      const { itemsPayload, payloadToCartLine } = buildPriceCartPayload(cart);

      try {
        const data = await fetchPriceCart({
          location: locationId,
          items: itemsPayload,
          coupon_code: manualCouponCode || undefined,
        });

        if (cancelled) return;
        if (manualCouponCode && data?.coupon_error) {
          setManualCouponCode("");
        }
        await applyPriceCartResponse(data, payloadToCartLine, cart);
      } catch (err) {
        if ((err as any).name === "AbortError") return;
        console.error("Error pricing cart", err);
      }
    }

    priceCart();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cart, locationId, manualCouponCode]);

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const dateLabel = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center h-screen w-screen bg-kk-pri-bg">
      {/* Sidebar */}
      <div
        className={`flex flex-col h-full bg-kk-ter-bg text-kk-pri-text transition-all duration-200 ${
          sidebarOpen ? "w-56" : "w-18"
        }`}
      >
        <div className={`flex items-center justify-between px-4 py-4 ${
            sidebarOpen ? "px-4" : "justify-center"}`}>
          {sidebarOpen ? (
            <div className="text-sm font-semibold">
              Hi, {cashierName}
            </div>
          ) : ("")}

          <button
            type="button"
            className="rounded-md p-2 cursor-pointer bg-transparent hover:bg-kk-sec-bg transition-all duration-250"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <Ellipsis className="w-6" />
          </button>
        </div>

        <nav className="flex-1 content-center items-center space-y-8">
          <SidebarItem
            label="POS"
            icon={(<Store />)}
            active={activeView === "POS"}
            sidebarOpen={sidebarOpen}
            onClick={() => setActiveView("POS")}
          />
          <SidebarItem
            label="On Hold"
            icon={(<StretchVertical />)}
            active={activeView === "HOLD"}
            sidebarOpen={sidebarOpen}
            onClick={() => setHeldOpen(true)}
          />
          <SidebarItem
            label="Orders"
            icon={(<ReceiptText />)}
            active={activeView === "ORDERS"}
            sidebarOpen={sidebarOpen}
            onClick={() => setActiveView("ORDERS")}
          />
        </nav>

        <div className="mt-auto border-t border-kk-border-strong px-4 py-4 text-xs text-kk-sec-text">
          {sidebarOpen ? (
            <button 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => logout()}
            >
              <LogOut />
              <span>Logout</span>
            </button>
          ) : (
            <LogOut 
              className="flex items-center justify-center cursor-pointer" 
              onClick={() => logout()}
            />
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="h-screen flex flex-1 flex-col">
        {/* Top header */}
        {/* <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <h1 className="text-lg font-semibold tracking-wide">
            {activeView === "POS" ? "POS" : "ORDERS"}
          </h1>
          <div className="text-right text-xs text-gray-600">
            <div className="font-semibold">{timeLabel}</div>
            <div>{dateLabel}</div>
          </div>
        </header> */}

        <main className="flex-1 overflow-hidden">
          {activeView === "POS" && (
            <div className="flex h-full">
              <div className="flex-1 bg-kk-pri-bg">
                <PosScreen
                  locationId={locationId}
                  onAddToCart={handleAddToCart}
                />
              </div>

              <div className="w-1/3 h-full min-h-0 overflow-hidden border-l border-kk-border bg-kk-sec-bg p-4 flex flex-col">
                <div className="mb-2 flex items-center justify-between shrink-0">
                  <h2 className="text-sm font-semibold text-kk-pri-text truncate" title={locationName}>
                    {locationName}
                  </h2>
                  <div className="text-right text-xs text-kk-sec-text">
                    <div className="font-semibold">{timeLabel}</div>
                    <div>{dateLabel}</div>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <CartPane
                    lines={cart}
                    promoLines={promoLines}
                    pricing={pricing}
                    appliedCoupon={appliedCoupon}
                    manualCouponCode={manualCouponCode}
                    lineDiscounts={lineDiscounts}
                    onChangeQty={handleChangeQty}
                    onRemoveLine={handleRemoveLine}
                    onClearCart={handleClearCart}
                    onClearAction={activeHeldOrder ? handleCancelHeldOrder : handleClearCart}
                    onApplyDiscountCode={applyDiscountFromRaw}
                    onRemoveDiscount={handleRemoveDiscount}
                    onHoldOrder={handleHoldOrder}
                    locationId={locationId}
                    holdOrderLabel={activeHeldOrder ? "Put Back On Hold" : "Hold Order"}
                    clearCartLabel={activeHeldOrder ? "Cancel Held Order" : "Clear Cart"}
                    heldOrderName={activeHeldOrder?.customer_name ?? null}
                    holding={holding}
                    onAfterPaymentCompleted={handleAfterPaymentCompleted}
                  />
                </div>
              </div>
            </div>
          )} 
          {activeView === "ORDERS" && (
            <OrdersScreen
              locationId={locationId}
              cashierName={cashierName}
            />
          )}
        </main>
      </div>

      <HeldOrdersModal
        isOpen={heldOpen}
        locationId={locationId}
        onClose={() => setHeldOpen(false)}
        fetchHeldOrders={listHeldOrders}
        loadHeldOrder={getHeldOrder}
        onReplaceCart={handleReplaceCart}
        onResumeHeldOrder={handleResumeHeldOrder}
      />

      <HoldOrderNameModal
        isOpen={holdNameOpen}
        onClose={() => setHoldNameOpen(false)}
        onConfirm={(name) => {
          setHoldNameOpen(false);
          saveNewHeldOrder(name);
        }}
      />

      {toast && (
        <div className="fixed top-6 left-1/2 z-[60] w-[min(92vw,24rem)] -translate-x-1/2 rounded-lg border border-kk-border-strong bg-kk-pri-bg px-4 py-3 text-center text-xs font-semibold text-kk-pri-text shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};

export default PosApp;
