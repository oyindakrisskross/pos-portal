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
  const [pricing, setPricing] = useState<CartPricingSummary | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("POS");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    setCart([]);
  };


  const handleApplyDiscount = () => {
    // For now you could pop a prompt; later replace with a proper UI.
    // Example: flat amount discount:
    // const value = window.prompt("Discount amount (₦):", "0") ?? "0";
    // setInvoiceDiscount({ type: "AMOUNT", value });
  };

  // --- Call backend PriceCartView whenever cart changes ---
  useEffect(() => {
    const controller = new AbortController();

    async function priceCart() {
      if (cart.length === 0) {
        setPricing({
          subtotal: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 0,
        });
        return;
      }

      // Build the payload expected by PriceCartView
      // (location + simple list of {item, quantity, unit_price})
      const itemsPayload: any[] = [];

      for (const line of cart) {
        const parent = line.item;
        itemsPayload.push({
          item: parent.id,
          quantity: line.quantity,
          unit_price: parent.price,
        });

        // customizations become extra mini-lines
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
          }
        }
      }

      try {
        const data = await fetchPriceCart({
          location: locationId,
          items: itemsPayload,
        });

        setPricing({
          subtotal: parseFloat(data.subtotal ?? "0") || 0,
          taxTotal: parseFloat(data.tax_total ?? "0") || 0,
          discountTotal: parseFloat(data.discount_total ?? "0") || 0,
          grandTotal: parseFloat(data.grand_total ?? "0") || 0,
        });
      } catch (err) {
        if ((err as any).name === "AbortError") return;
        console.error("Error pricing cart", err);
      }
    }

    priceCart();

    return () => controller.abort();
  }, [cart, locationId]);

  const now = useMemo(() => new Date(), []);
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

              <div className="w-1/3 h-full overflow-hidden border-l border-kk-border bg-kk-sec-bg p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold"></h2>
                  <div className="text-right text-xs text-kk-sec-text">
                    <div className="font-semibold">{timeLabel}</div>
                    <div>{dateLabel}</div>
                  </div>
                </div>

                <CartPane
                  lines={cart}
                  pricing={pricing}
                  onChangeQty={handleChangeQty}
                  onRemoveLine={handleRemoveLine}
                  onClearCart={handleClearCart}
                  onApplyDiscount={handleApplyDiscount}
                  onHoldOrder={handleHoldOrder}
                  locationId={locationId}
                />
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