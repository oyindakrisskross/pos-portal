// src/screens/layout/AppShell.tsx

import React, { useEffect, useMemo, useState } from "react";
import { PosScreen } from "../PosScreen";
import type { 
  AddToCartPayload, 
  CartLine, 
  CartPricingSummary, 
  HeldOrderSummary, 
} from "../../types/catalog";
import { CartPane } from "../../components/CartPane";
import { createHoldCart, fetchHeldOrders, fetchPriceCart, loadHeldOrder } from "../../api/cart";
import { HeldOrdersModal } from "../../components/HeldOrdersModal";
import { fetchPOSItem } from "../../api/catalog";
import { OrdersScreen } from "../OrdersScreen";
import { Ellipsis, LogOut, ReceiptText, Store, StretchVertical } from "lucide-react";
import { SidebarItem } from "../../components/SideBarItem";
import { useAuth } from "../../auth/AuthContext";
import type { AppliedCoupon } from "../../types/invoice";


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
  const [activeView, setActiveView] = useState<ViewKey>("POS");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const buildPriceCartPayload = (cartLines: CartLine[]) => {
    const itemsPayload: any[] = [];
    const payloadToCartLine: string[] = [];

    for (const line of cartLines) {
      const parent = line.item;
      itemsPayload.push({
        item: parent.id,
        quantity: line.quantity,
        unit_price: parent.price,
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
      if (!disc) return;
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
          ? { ...line, quantity: line.quantity + 1 }
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

  const listHeldOrders = async (locationId: number): Promise<HeldOrderSummary[]> => {
    return await fetchHeldOrders(locationId);
  };

  const getHeldOrder = async (heldOrderId: number): Promise<AddToCartPayload[]> => {
    const data = await loadHeldOrder(heldOrderId);

    const lines = await Promise.all(
      data.items.map(async (row: any): Promise<AddToCartPayload> => {
        const item = await fetchPOSItem(row.item, {location_id: locationId});

        const customizations = 
          row.customization_id && row.customization_qty
          ? [
              {
                customizationId: Number(row.customization_id),
                quantity: Number(row.customization_qty),
              },
            ]
          : [];

        return {
          item,
          quantity: Number(row.quantity),
          customizations,
        };
      })
    );
    return lines;
  };

  const handleChangeQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => 
          line.id === lineId
            ? {
                ...line,
                quantity: Math.max(0, line.quantity + delta),
              }
            : line
        )
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

  const handleHoldOrder = async () => {
    if (cart.length === 0) return;

    // Build payload EXACTLY like price-cart items
    const itemsPayload: any[] = [];

    for (const line of cart) {
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

    const held = await createHoldCart({
      location: locationId,
      items: itemsPayload,
    });
    console.log("Held order saved:", held);
    handleClearCart();
  };


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
                  <h2 className="text-sm font-semibold"></h2>
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
                    onApplyDiscountCode={applyDiscountFromRaw}
                    onRemoveDiscount={handleRemoveDiscount}
                    onHoldOrder={handleHoldOrder}
                    locationId={locationId}
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
      />
    </div>
  );
};

export default PosApp;
