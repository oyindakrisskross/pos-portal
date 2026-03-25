// src/screens/layout/AppShell.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PosScreen } from "../PosScreen";
import { SubscriptionsScreen } from "../SubscriptionsScreen";
import type { 
  AddToCartPayload, 
  CartLine, 
  CartPricingSummary, 
  HeldOrderSummary, 
  POSItem,
} from "../../types/catalog";
import { CartPane } from "../../components/CartPane";
import {
  cancelHeldOrder,
  completeHeldOrder,
  createHoldCart,
  fetchHeldOrders,
  fetchPriceCart,
  loadHeldOrder,
  lookupPrepaidInvoice,
  lookupSubscriptionPass,
  resolvePOSQR,
  redeemSubscriptionPass,
  type POSQRKind,
  type POSQRResolveResponse,
  redeemPrepaidInvoice,
  updateHoldCart,
} from "../../api/cart";
import { HeldOrdersModal } from "../../components/HeldOrdersModal";
import { HoldOrderNameModal } from "../../components/HoldOrderNameModal";
import { fetchPOSItem } from "../../api/catalog";
import { OrdersScreen } from "../OrdersScreen";
import { Ellipsis, LogOut, ReceiptText, Store, StretchVertical, TicketPercent } from "lucide-react";
import { SidebarItem } from "../../components/SideBarItem";
import { useAuth } from "../../auth/AuthContext";
import type { AppliedCoupon } from "../../types/invoice";
import { parseDecimal } from "../../helpers/posHelpers";
import { computeSubscriptionSaleSummary, splitSubscriptionSaleLines } from "../../helpers/invoiceHelpers";
import { fetchOutlets } from "../../api/auth";
import { CouponDecisionModal } from "../../components/CouponDecisionModal";
import { consumeWalletTicket } from "../../api/entryPass";
import type { POSSubscriptionPlan, POSSubscriptionProduct } from "../../types/subscriptions";


function makeLineId(counter: number) {
  // simple deterministic id – good enough for now
  return `${Date.now()}-${counter}`;
}

type ViewKey = "POS" | "SUBSCRIPTIONS" | "ORDERS" | "HOLD";

function buildRedeemStubItem(itemId: number, itemName?: string, itemSku?: string): POSItem {
  const fallbackName = `Item #${itemId}`;
  return {
    id: itemId,
    sku: String(itemSku || `ITEM-${itemId}`),
    name: String(itemName || fallbackName),
    description: null,
    type_id: "SERVICE",
    sellable: true,
    group: null,
    unit: null,
    price: "0.00",
    sale_tax: null,
    sale_tax_rate: null,
    inventory_tracking: false,
    returnable: false,
    scheduled: false,
    stock_qty: "0",
    primary_image: null,
    group_primary_image: null,
    customized: false,
    variant_key: null,
    customizations: [],
  };
}

function buildSubscriptionSaleStubItem(
  planId: number,
  productName: string,
  planName: string,
  planCode: string,
  linePrice: string
): POSItem {
  return {
    id: -Math.abs(planId),
    sku: `SUB-PLAN-${planCode || planId}`,
    name: `${productName} - ${planName}`,
    description: `Subscription plan ${planCode || planId}`,
    type_id: "SERVICE",
    sellable: true,
    group: null,
    unit: null,
    price: linePrice,
    sale_tax: null,
    sale_tax_rate: null,
    inventory_tracking: false,
    returnable: false,
    scheduled: false,
    stock_qty: "0",
    primary_image: null,
    group_primary_image: null,
    customized: false,
    variant_key: null,
    customizations: [],
  };
}

type AssignedCustomer = {
  portalCustomerId: number;
  contactId: number;
  name: string;
  email?: string | null;
  phone?: string | null;
};

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
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCoupon[]>([]);
  const [manualCouponCodes, setManualCouponCodes] = useState<string[]>([]);
  const [assignedCustomer, setAssignedCustomer] = useState<AssignedCustomer | null>(null);
  const [scanDecision, setScanDecision] = useState<{
    scannedCode: string;
    scannedName: string;
    combineAvailable: boolean;
  } | null>(null);
  const [prepaidSession, setPrepaidSession] = useState<{
    invoiceId: number;
    invoiceNumber: string;
    prepaidNumber: string;
    availableQty: number;
  } | null>(null);
  const [subscriptionSession, setSubscriptionSession] = useState<{
    token: string;
    subscriptionId: number;
    planName: string;
    customerName: string;
    totalUses: number | null;
    usedUses: number;
  } | null>(null);
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

  const apiErrorMessage = (err: any, fallback: string) => {
    const data = err?.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data?.detail) return String(data.detail);
    if (data?.message) return String(data.message);
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      return String(data.non_field_errors[0]);
    }
    return err?.message || fallback;
  };

  const resolveScannedQR = async (
    raw: string
  ): Promise<{ ok: true; data: POSQRResolveResponse } | { ok: false; error: string }> => {
    const text = String(raw || "").trim();
    if (!text) {
      return { ok: false, error: "No code detected." };
    }

    try {
      const data = await resolvePOSQR(text, locationId);
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: apiErrorMessage(err, "Unable to resolve QR code.") };
    }
  };

  const kindRouteMessage = (kind: POSQRKind, target: "discount" | "customer" | "redeem") => {
    if (target === "discount") {
      if (kind === "CUSTOMER") return "This is a customer QR. Use Assign Customer.";
      if (kind === "PREPAID" || kind === "WALLET_TICKET") {
        return "This is a redeemable QR. Use Redeem Items.";
      }
    }

    if (target === "customer") {
      if (kind === "COUPON") return "This is a coupon QR. Use Apply Discount.";
      if (kind === "SUBSCRIPTION_PASS") return "This is a subscription QR. Use Apply Discount.";
      if (kind === "PREPAID" || kind === "WALLET_TICKET") {
        return "This is a redeemable QR. Use Redeem Items.";
      }
    }

    if (target === "redeem") {
      if (kind === "COUPON") return "This is a coupon QR. Use Apply Discount.";
      if (kind === "CUSTOMER") return "This is a customer QR. Use Assign Customer.";
    }

    return "Unsupported QR type.";
  };

  const buildPriceCartPayload = (cartLines: CartLine[]) => {
    const itemsPayload: any[] = [];
    const payloadToCartLine: string[] = [];

    for (let parentIdx = 0; parentIdx < cartLines.length; parentIdx++) {
      const line = cartLines[parentIdx];
      if (line.subscriptionSale) continue;
      const parent = line.item;
      const parentUnitPrice = line.prepaid ? "0.00" : parent.price;
      itemsPayload.push({
        item: parent.id,
        quantity: line.quantity,
        unit_price: parentUnitPrice,
        parent_idx: parentIdx,
        is_child: false,
      });
      payloadToCartLine.push(line.id);

      if (!line.prepaid && line.customizations?.length && parent.customizations?.length) {
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

    const nextAppliedCoupons = (
      Array.isArray(data?.applied_coupons)
        ? data.applied_coupons
        : data?.applied_coupon
          ? [data.applied_coupon]
          : []
    ).filter((c: any) => c?.code) as AppliedCoupon[];
    setAppliedCoupons(nextAppliedCoupons);

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
    if (bonusLines.length) {
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
            id: `promo-${nextAppliedCoupons[0]?.code ?? "coupon"}-${itemId}-${idx}`,
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
          !line.prepaid &&
          line.item.id === payload.item.id &&
          line.customizations.length === payload.customizations.length &&
          line.customizations.every(
            (c, i) =>
              c.customizationId === payload.customizations[i].customizationId &&
              c.quantity === payload.customizations[i].quantity
          )
      );

      if (existingIndex === -1) {
        // Standard sale lines can coexist with loaded redeemable lines.
        // Checkout will charge only the payable lines, then redeem the loaded items.
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

  const handleAddSubscriptionPlanToCart = (
    plan: POSSubscriptionPlan,
    product: POSSubscriptionProduct,
    quantity: number
  ) => {
    if (prepaidSession || subscriptionSession) {
      showToast("Finish or clear the current redemption session before selling subscriptions.");
      return;
    }

    const unitPrice = parseDecimal(plan.price, 0) + parseDecimal(plan.setup_fee ?? "0", 0);
    const linePrice = unitPrice.toFixed(2);
    const safeQty = Math.max(1, Math.floor(Number(quantity || 1)));

    setCart((prev) => {
      if (prev.some((line) => Boolean(line.prepaid))) {
        showToast("Redeemable carts cannot be mixed with subscription sales.");
        return prev;
      }

      const existingIndex = prev.findIndex(
        (line) => line.subscriptionSale?.planId === plan.id && !line.prepaid
      );

      if (existingIndex >= 0) {
        return prev.map((line, idx) =>
          idx === existingIndex ? { ...line, quantity: line.quantity + safeQty } : line
        );
      }

      const stubItem = buildSubscriptionSaleStubItem(
        plan.id,
        String(product.name || "Subscription"),
        String(plan.name || "Plan"),
        String(plan.code || plan.id),
        linePrice
      );

      const nextLine: CartLine = {
        id: makeLineId(prev.length),
        item: stubItem,
        quantity: safeQty,
        customizations: [],
        subscriptionSale: {
          planId: plan.id,
          planCode: String(plan.code || ""),
          planName: String(plan.name || "Plan"),
          productId: Number(plan.product || product.id),
          productName: String(plan.product_name || product.name || "Subscription"),
          planType: plan.plan_type,
          billingFrequencyValue: Number(plan.billing_frequency_value || 1),
          billingFrequencyUnit: plan.billing_frequency_unit,
          setupFee: String(plan.setup_fee ?? "0.00"),
          salesTaxRate: plan.sales_tax_rate ?? null,
          usesPhysicalCard: Boolean(plan.uses_physical_card),
          requiresCardSerial: Boolean(plan.requires_card_serial),
        },
      };

      return [...prev, nextLine];
    });

    showToast(`Added subscription plan: ${plan.name}`);
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

          if (line.prepaid) {
            const maxQty = Number(line.prepaidMaxQty ?? line.quantity ?? 0);
            const nextQty = line.quantity + delta;
            if (nextQty > maxQty) {
              showToast(`Maximum redeemable quantity for "${line.item.name}" is ${maxQty}.`);
              return line;
            }
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
    setManualCouponCodes([]);
    setAppliedCoupons([]);
    setAssignedCustomer(null);
    setScanDecision(null);
    setPrepaidSession(null);
    setSubscriptionSession(null);
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
    if (cart.some((ln) => Boolean(ln.prepaid))) {
      showToast("Pre-paid redemption carts cannot be held.");
      return;
    }
    if (cart.some((ln) => Boolean(ln.subscriptionSale))) {
      showToast("Subscription checkout carts cannot be held.");
      return;
    }
    if (activeHeldOrder) {
      await saveExistingHeldOrder();
      return;
    }
    setHoldNameOpen(true);
  };

  const getCouponDisplayName = (coupon: any, fallbackLabel = "Coupon"): string => {
    const name = coupon?.name ?? coupon?.coupon_name;
    const display = String(name || "").trim();
    return display || fallbackLabel;
  };

  const loadPrepaidFromCode = async (
    rawCode: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const normalized = String(rawCode || "").trim().toUpperCase();
    if (!normalized.startsWith("PPP-")) {
      return { ok: false, error: "Invalid pre-paid code format." };
    }

    try {
      const data = await lookupPrepaidInvoice(normalized, locationId);
      if (subscriptionSession) {
        return {
          ok: false,
          error: "Finish or clear the current subscription redemption before loading a pre-paid invoice.",
        };
      }
      if (prepaidSession && Number(prepaidSession.invoiceId) !== Number(data.invoice_id)) {
        return {
          ok: false,
          error: `Finish or clear ${prepaidSession.prepaidNumber} before loading another pre-paid invoice.`,
        };
      }
      const sourceLines = Array.isArray(data?.lines) ? data.lines : [];

      const loaded = sourceLines.map((ln, idx) => {
        const qty = Number(ln?.remaining_quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) return null;

        const itemId = Number(ln.item_id);
        return {
          id: `prepaid-${ln.line_id}-${idx}`,
          item: buildRedeemStubItem(itemId, ln.item_name, ln.item_sku),
          quantity: qty,
          customizations: [],
          prepaid: true,
          redeemSource: "PREPAID",
          prepaidInvoiceId: Number(data.invoice_id),
          prepaidNumber: String(data.prepaid_number || normalized),
          prepaidInvoiceLineId: Number(ln.line_id),
          prepaidMaxQty: qty,
        } as CartLine;
      });

      const nextCart = loaded.filter(Boolean) as CartLine[];
      if (!nextCart.length) {
        return { ok: false, error: "This pre-paid invoice has no redeemable items remaining." };
      }

      setCart((prev) => {
        const saleLines = prev.filter((ln) => !ln.prepaid);
        return [...saleLines, ...nextCart];
      });
      setPromoLines([]);
      setManualCouponCodes([]);
      setAppliedCoupons([]);
      setLineDiscounts({});
      setScanDecision(null);
      setSubscriptionSession(null);
      setPrepaidSession({
        invoiceId: Number(data.invoice_id),
        invoiceNumber: String(data.invoice_number || ""),
        prepaidNumber: String(data.prepaid_number || normalized),
        availableQty: nextCart.reduce((sum, ln) => sum + Number(ln.prepaidMaxQty ?? ln.quantity ?? 0), 0),
      });
      showToast(`Loaded ${data.prepaid_number || normalized} for redemption.`);
      return { ok: true };
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || e?.message || "Unable to load pre-paid invoice.");
      return { ok: false, error: detail };
    }
  };

  const redeemPrepaidFromCart = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!prepaidSession) {
      return { ok: false, error: "No pre-paid invoice loaded." };
    }

    const selected = cart
      .filter((ln) => Boolean(ln.prepaidInvoiceLineId) && Number(ln.quantity) > 0)
      .map((ln) => ({
        line_id: Number(ln.prepaidInvoiceLineId),
        quantity: String(ln.quantity),
      }));

    if (!selected.length) {
      return { ok: false, error: "No redeemable items selected." };
    }

    try {
      const data = await redeemPrepaidInvoice({
        invoice_id: prepaidSession.invoiceId,
        lines: selected,
      });
      showToast(String(data?.detail || "Pre-paid invoice redeemed."));
      handleClearCart();
      return { ok: true };
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || e?.message || "Unable to redeem pre-paid invoice.");
      return { ok: false, error: detail };
    }
  };

  const redeemSubscriptionFromCart = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!subscriptionSession) {
      return { ok: false, error: "No subscription redemption loaded." };
    }

    const selected = cart
      .filter(
        (ln) =>
          ln.redeemSource === "SUBSCRIPTION" &&
          ln.subscriptionToken === subscriptionSession.token &&
          Boolean(ln.subscriptionPlanItemId) &&
          Number(ln.quantity) > 0
      )
      .map((ln) => ({
        plan_item_id: Number(ln.subscriptionPlanItemId),
        quantity: String(ln.quantity),
      }));

    if (!selected.length) {
      return { ok: false, error: "No redeemable subscription items selected." };
    }

    try {
      const data = await redeemSubscriptionPass({
        token: subscriptionSession.token,
        location_id: locationId,
        pos_reference: `POS-SUB-${Date.now()}`,
        lines: selected,
      });
      const used = Number(data?.used_uses ?? 0);
      const total =
        data?.total_uses === null || data?.total_uses === undefined
          ? null
          : Number(data.total_uses);
      const detail = String(data?.detail || "").trim();

      if (detail) {
        showToast(detail);
      } else if (total !== null && Number.isFinite(total) && total > 0) {
        showToast(`Subscription items redeemed (${used}/${total} used).`);
      } else {
        showToast("Subscription items redeemed.");
      }

      handleClearCart();
      return { ok: true };
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || e?.message || "Unable to redeem subscription items.");
      return { ok: false, error: detail };
    }
  };

  const redeemLoadedItemsFromCart = async (): Promise<{ ok: boolean; error?: string }> => {
    if (prepaidSession) {
      return redeemPrepaidFromCart();
    }
    if (subscriptionSession) {
      return redeemSubscriptionFromCart();
    }
    return { ok: false, error: "No redeemable items loaded." };
  };

  const handleAfterPaymentCompleted = async (_invoice: any = null) => {
    const hasRedeemableItems = cart.some(
      (ln) => Boolean(ln.prepaid) && Number(ln.quantity || 0) > 0
    );
    if (hasRedeemableItems) {
      const redeem = await redeemLoadedItemsFromCart();
      if (!redeem.ok) {
        showToast(redeem.error || "Unable to redeem items.");
      }
    }

    const current = activeHeldOrder;
    if (!current) return;

    try {
      await completeHeldOrder(current.id);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to complete held order.");
    } finally {
      setActiveHeldOrder(null);
    }
  };

  const previewCouponCodes = async (
    couponCodes: string[]
  ): Promise<{ ok: boolean; data?: any; error?: string; reason?: string }> => {
    if (cart.some((ln) => Boolean(ln.subscriptionSale))) {
      return { ok: false, error: "Coupons cannot be applied to subscription checkout carts." };
    }
    if (prepaidSession || subscriptionSession) {
      return { ok: false, error: "Coupons cannot be applied while redeemable items are in the cart." };
    }

    const normalizedCodes = Array.from(
      new Set(couponCodes.map((c) => String(c || "").trim()).filter(Boolean))
    );
    const { itemsPayload } = buildPriceCartPayload(cart);
    try {
      const data = await fetchPriceCart({
        location: locationId,
        items: itemsPayload,
        coupon_code: normalizedCodes[0] || undefined,
        coupon_codes: normalizedCodes,
      });
      const couponError = data?.coupon_error;
      if (couponError) {
        return {
          ok: false,
          error: String(couponError?.detail || "Coupon not valid."),
          reason: String(couponError?.reason || ""),
        };
      }
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Unable to apply coupon." };
    }
  };

  const applyCouponCodes = async (
    couponCodes: string[]
  ): Promise<{ ok: boolean; error?: string }> => {
    if (cart.some((ln) => Boolean(ln.subscriptionSale))) {
      return { ok: false, error: "Coupons cannot be applied to subscription checkout carts." };
    }
    if (prepaidSession || subscriptionSession) {
      return { ok: false, error: "Coupons cannot be applied while redeemable items are in the cart." };
    }

    const normalizedCodes = Array.from(
      new Set(couponCodes.map((c) => String(c || "").trim()).filter(Boolean))
    );
    const attempt = await previewCouponCodes(normalizedCodes);
    if (!attempt.ok || !attempt.data) {
      return { ok: false, error: attempt.error || "Unable to apply coupon." };
    }

    const { payloadToCartLine } = buildPriceCartPayload(cart);
    setManualCouponCodes(normalizedCodes);
    await applyPriceCartResponse(attempt.data, payloadToCartLine, cart);
    return { ok: true };
  };

  const applyDiscountFromRaw = async (
    raw: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const resolved = await resolveScannedQR(raw);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    if (cart.some((ln) => Boolean(ln.subscriptionSale))) {
      return { ok: false, error: "Coupons cannot be applied to subscription checkout carts." };
    }

    if (prepaidSession || subscriptionSession) {
      return { ok: false, error: "Finish redeeming or clear redeemable items before scanning coupons." };
    }

    if (resolved.data.kind === "SUBSCRIPTION_PASS") {
      const subscription = resolved.data.subscription;
      if (!subscription) {
        return { ok: false, error: "Subscription details could not be resolved from this QR code." };
      }
      if (String(subscription.status || "").trim().toUpperCase() !== "ACTIVE") {
        return { ok: false, error: "Subscription is not active." };
      }

      const assigned = attachCustomerToCart(subscription.customer, false);
      if (!assigned.ok) return { ok: false, error: assigned.error };

      const candidateCodes = Array.from(
        new Set(
          (Array.isArray(subscription.coupons) ? subscription.coupons : [])
            .map((row) => String(row?.code || "").trim())
            .filter(Boolean)
        )
      );
      if (!candidateCodes.length) {
        return { ok: false, error: "No subscription coupons are attached to this plan." };
      }

      if (candidateCodes.length === 1) {
        const applyOne = await applyCouponCodes([candidateCodes[0]]);
        if (!applyOne.ok) {
          return { ok: false, error: applyOne.error || "No eligible subscription coupons match the current cart." };
        }
        showToast(`Assigned customer: ${assigned.customer?.name || "Customer"}`);
        return { ok: true };
      }

      const applyAll = await applyCouponCodes(candidateCodes);
      if (!applyAll.ok) {
        const previewResults = await Promise.all(
          candidateCodes.map(async (code) => ({
            code,
            preview: await previewCouponCodes([code]),
          }))
        );
        const eligibleCodes = previewResults
          .filter((row) => row.preview.ok)
          .map((row) => row.code);

        if (!eligibleCodes.length) {
          return { ok: false, error: "No eligible subscription coupons match the current cart." };
        }

        const applyEligible = await applyCouponCodes(eligibleCodes);
        if (!applyEligible.ok) {
          const fallback = await applyCouponCodes([eligibleCodes[0]]);
          if (!fallback.ok) {
            return {
              ok: false,
              error:
                fallback.error ||
                applyEligible.error ||
                applyAll.error ||
                "Unable to apply subscription coupon.",
            };
          }
        }
      }

      showToast(`Assigned customer: ${assigned.customer?.name || "Customer"}`);
      return { ok: true };
    }

    if (resolved.data.kind !== "COUPON") {
      return { ok: false, error: kindRouteMessage(resolved.data.kind, "discount") };
    }

    const couponCode = String(resolved.data.coupon?.code || "").trim();
    if (!couponCode) {
      return { ok: false, error: "Coupon code is missing." };
    }

    const overridePreview = await previewCouponCodes([couponCode]);
    if (!overridePreview.ok) {
      return { ok: false, error: overridePreview.error || "Coupon not valid." };
    }

    const overrideCoupons = (
      Array.isArray(overridePreview.data?.applied_coupons)
        ? overridePreview.data.applied_coupons
        : overridePreview.data?.applied_coupon
          ? [overridePreview.data.applied_coupon]
          : []
    ).filter((c: any) => c?.code);
    const scannedCoupon =
      overrideCoupons.find(
        (c: any) =>
          String(c?.code || "").trim().toLowerCase() === couponCode.toLowerCase()
      ) ?? overrideCoupons[0];
    const scannedName =
      String(resolved.data.coupon?.name || "").trim() || getCouponDisplayName(scannedCoupon, "Coupon");

    const currentCodes = appliedCoupons.map((c) => c.code).filter(Boolean);
    if (!currentCodes.length) {
      return applyCouponCodes([couponCode]);
    }

    const combinePreview = await previewCouponCodes([...currentCodes, couponCode]);
    const combineAvailable = Boolean(combinePreview.ok);
    setScanDecision({ scannedCode: couponCode, scannedName, combineAvailable });
    return { ok: true };
  };

  const attachCustomerToCart = (
    scannedCustomer: any,
    announce = true
  ): { ok: boolean; error?: string; customer?: AssignedCustomer } => {
    const contactId = Number(scannedCustomer?.contact_id ?? 0);
    if (!Number.isFinite(contactId) || contactId <= 0) {
      return { ok: false, error: "This customer does not have a linked contact record." };
    }

    const nextAssigned: AssignedCustomer = {
      portalCustomerId: Number(scannedCustomer?.portal_customer_id ?? 0),
      contactId,
      name: String(scannedCustomer?.name || "Customer"),
      email: scannedCustomer?.email ?? null,
      phone: scannedCustomer?.phone ?? null,
    };
    setAssignedCustomer(nextAssigned);
    if (announce) {
      showToast(`Assigned customer: ${nextAssigned.name}`);
    }
    return { ok: true, customer: nextAssigned };
  };

  const assignCustomerFromRaw = async (
    raw: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const resolved = await resolveScannedQR(raw);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    if (resolved.data.kind !== "CUSTOMER") {
      return { ok: false, error: kindRouteMessage(resolved.data.kind, "customer") };
    }

    const attached = attachCustomerToCart(resolved.data.customer, true);
    if (!attached.ok) return { ok: false, error: attached.error };
    return { ok: true };
  };

  const loadSubscriptionFromToken = async (
    token: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (prepaidSession) {
        return {
          ok: false,
          error: "Finish or clear the current pre-paid redemption before loading a subscription pass.",
        };
      }
      const data = await lookupSubscriptionPass(token, locationId);
      if (
        subscriptionSession &&
        Number(subscriptionSession.subscriptionId) !== Number(data.subscription_id)
      ) {
        return {
          ok: false,
          error: "Finish or clear the current subscription redemption before loading another pass.",
        };
      }

      const sourceLines = Array.isArray(data?.lines) ? data.lines : [];
      const loaded = sourceLines.map((ln, idx) => {
        const maxQtyRaw = Number(ln?.max_quantity ?? 0);
        const maxQty = Number.isFinite(maxQtyRaw) ? Math.max(0, Math.floor(maxQtyRaw)) : 0;
        if (maxQty <= 0) return null;

        const itemId = Number(ln.item_id);
        return {
          id: `subscription-${ln.plan_item_id}-${idx}`,
          item: buildRedeemStubItem(itemId, ln.item_name, ln.item_sku),
          quantity: 1,
          customizations: [],
          prepaid: true,
          redeemSource: "SUBSCRIPTION",
          prepaidMaxQty: maxQty,
          subscriptionToken: String(data.token || token),
          subscriptionId: Number(data.subscription_id),
          subscriptionPlanItemId: Number(ln.plan_item_id),
        } as CartLine;
      });

      const nextCart = loaded.filter(Boolean) as CartLine[];
      if (!nextCart.length) {
        return { ok: false, error: "No redeemable items are currently eligible for this subscription." };
      }

      setCart((prev) => {
        const saleLines = prev.filter((ln) => !ln.prepaid);
        return [...saleLines, ...nextCart];
      });
      setPromoLines([]);
      setManualCouponCodes([]);
      setAppliedCoupons([]);
      setLineDiscounts({});
      setScanDecision(null);
      setPrepaidSession(null);
      setSubscriptionSession({
        token: String(data.token || token),
        subscriptionId: Number(data.subscription_id),
        planName: String(data.plan_name || "Subscription"),
        customerName: String(data.customer_name || "Customer"),
        totalUses:
          data.total_uses === null || data.total_uses === undefined
            ? null
            : Number(data.total_uses),
        usedUses: Number(data.used_uses ?? 0),
      });
      showToast(`Loaded ${String(data.plan_name || "Subscription")} items for redemption.`);

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: apiErrorMessage(err, "Unable to load subscription pass.") };
    }
  };

  const redeemWalletTicketFromToken = async (
    token: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await consumeWalletTicket({
        qr_token: token,
        location_id: locationId,
        pos_reference: `POS-WALLET-${Date.now()}`,
      });
      showToast("Wallet ticket redeemed.");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: apiErrorMessage(err, "Unable to redeem ticket.") };
    }
  };

  const redeemItemsFromRaw = async (
    raw: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const resolved = await resolveScannedQR(raw);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    if (resolved.data.kind === "PREPAID") {
      const code = String(resolved.data.prepaid?.code || "").trim().toUpperCase();
      if (!code) {
        return { ok: false, error: "Pre-paid code is missing." };
      }
      return loadPrepaidFromCode(code);
    }

    if (resolved.data.kind === "SUBSCRIPTION_PASS") {
      const token = String(resolved.data.redeem?.token || "").trim();
      if (!token) {
        return { ok: false, error: "Pass token is missing." };
      }
      return loadSubscriptionFromToken(token);
    }

    if (resolved.data.kind === "WALLET_TICKET") {
      const token = String(resolved.data.redeem?.token || "").trim();
      if (!token) {
        return { ok: false, error: "Ticket token is missing." };
      }
      return redeemWalletTicketFromToken(token);
    }

    return { ok: false, error: kindRouteMessage(resolved.data.kind, "redeem") };
  };

  const handleOverrideScannedCoupon = async () => {
    if (!scanDecision?.scannedCode) return;
    const scanned = scanDecision.scannedCode;
    setScanDecision(null);
    const res = await applyCouponCodes([scanned]);
    if (!res.ok) showToast(res.error || "Unable to apply coupon.");
  };

  const handleCombineScannedCoupon = async () => {
    if (!scanDecision?.scannedCode) return;
    const scanned = scanDecision.scannedCode;
    const currentCodes = appliedCoupons.map((c) => c.code).filter(Boolean);
    setScanDecision(null);
    const res = await applyCouponCodes([...currentCodes, scanned]);
    if (!res.ok) showToast(res.error || "Unable to combine coupon.");
  };

  const handleRemoveDiscount = async () => {
    if (cart.some((ln) => Boolean(ln.subscriptionSale))) return;
    if (prepaidSession || subscriptionSession) return;
    if (!manualCouponCodes.length) return;
    setManualCouponCodes([]);

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

  useEffect(() => {
    if (!prepaidSession) return;
    const hasPrepaidLines = cart.some(
      (ln) =>
        ln.redeemSource === "PREPAID" &&
        Number(ln.prepaidInvoiceId) === Number(prepaidSession.invoiceId)
    );
    if (!hasPrepaidLines) {
      setPrepaidSession(null);
    }
  }, [cart, prepaidSession]);

  useEffect(() => {
    if (!subscriptionSession) return;
    const hasSubscriptionLines = cart.some(
      (ln) =>
        ln.redeemSource === "SUBSCRIPTION" &&
        String(ln.subscriptionToken || "") === String(subscriptionSession.token)
    );
    if (!hasSubscriptionLines) {
      setSubscriptionSession(null);
    }
  }, [cart, subscriptionSession]);

  // --- Call backend PriceCartView whenever cart changes ---
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function priceCart() {
      if (cart.length === 0 && !manualCouponCodes.length) {
        setPricing({
          subtotal: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 0,
        });
        setAppliedCoupons([]);
        setLineDiscounts({});
        setPromoLines([]);
        return;
      }

      const { subscriptionLines, standardLines } = splitSubscriptionSaleLines(cart);
      if (subscriptionLines.length) {
        const subscriptionSummary = computeSubscriptionSaleSummary(subscriptionLines);
        setAppliedCoupons([]);
        if (manualCouponCodes.length) {
          setManualCouponCodes([]);
        }

        if (!standardLines.length) {
          if (cancelled) return;
          setPricing(subscriptionSummary);
          setLineDiscounts({});
          setPromoLines([]);
          return;
        }

        const { itemsPayload, payloadToCartLine } = buildPriceCartPayload(standardLines);
        try {
          const data = await fetchPriceCart({
            location: locationId,
            items: itemsPayload,
          });

          if (cancelled) return;
          await applyPriceCartResponse(data, payloadToCartLine, standardLines);

          const regularSummary = {
            subtotal: parseFloat(data?.subtotal ?? "0") || 0,
            taxTotal: parseFloat(data?.tax_total ?? "0") || 0,
            discountTotal: parseFloat(data?.discount_total ?? "0") || 0,
            grandTotal: parseFloat(data?.grand_total ?? "0") || 0,
          };
          setAppliedCoupons([]);
          setPromoLines([]);
          setPricing({
            subtotal: regularSummary.subtotal + subscriptionSummary.subtotal,
            taxTotal: regularSummary.taxTotal + subscriptionSummary.taxTotal,
            discountTotal: regularSummary.discountTotal + subscriptionSummary.discountTotal,
            grandTotal: regularSummary.grandTotal + subscriptionSummary.grandTotal,
          });
        } catch (err) {
          if ((err as any).name === "AbortError") return;
          console.error("Error pricing mixed subscription cart", err);
        }
        return;
      }

      // Build the payload expected by PriceCartView
      // (location + simple list of {item, quantity, unit_price})
      const { itemsPayload, payloadToCartLine } = buildPriceCartPayload(cart);

      try {
        const data = await fetchPriceCart({
          location: locationId,
          items: itemsPayload,
          coupon_code: manualCouponCodes[0] || undefined,
          coupon_codes: manualCouponCodes.length ? manualCouponCodes : undefined,
        });

        if (cancelled) return;
        if (manualCouponCodes.length && data?.coupon_error) {
          setManualCouponCodes([]);
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
  }, [cart, locationId, manualCouponCodes, prepaidSession, subscriptionSession]);

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
  const hasRedeemableLines = cart.some((ln) => Boolean(ln.prepaid));
  const hasPayableLines = cart.some((ln) => !ln.prepaid);
  const isRedeemOnlyCart = hasRedeemableLines && !hasPayableLines;
  const redeemSessionLabel = prepaidSession
    ? `${prepaidSession.prepaidNumber}${
        prepaidSession.invoiceNumber ? ` (${prepaidSession.invoiceNumber})` : ""
      }`
    : subscriptionSession
    ? `${subscriptionSession.planName} - ${subscriptionSession.customerName}`
    : null;

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
            label="Subscriptions"
            icon={(<TicketPercent />)}
            active={activeView === "SUBSCRIPTIONS"}
            sidebarOpen={sidebarOpen}
            onClick={() => setActiveView("SUBSCRIPTIONS")}
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
          {(activeView === "POS" || activeView === "SUBSCRIPTIONS") && (
            <div className="flex h-full">
              <div className="flex-1 bg-kk-pri-bg">
                {activeView === "POS" ? (
                  <PosScreen
                    locationId={locationId}
                    onAddToCart={handleAddToCart}
                  />
                ) : (
                  <SubscriptionsScreen onAddPlanToCart={handleAddSubscriptionPlanToCart} />
                )}
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
                    appliedCoupons={appliedCoupons}
                    manualCouponCodes={manualCouponCodes}
                    lineDiscounts={lineDiscounts}
                    onChangeQty={handleChangeQty}
                    onRemoveLine={handleRemoveLine}
                    onClearCart={handleClearCart}
                    onClearAction={activeHeldOrder ? handleCancelHeldOrder : handleClearCart}
                    onApplyDiscountCode={applyDiscountFromRaw}
                    onAssignCustomerCode={assignCustomerFromRaw}
                    onRedeemItemsCode={redeemItemsFromRaw}
                    onLoadLookupSubscription={loadSubscriptionFromToken}
                    onLoadLookupPrepaid={loadPrepaidFromCode}
                    onRemoveDiscount={handleRemoveDiscount}
                    onHoldOrder={handleHoldOrder}
                    locationId={locationId}
                    assignedCustomerId={assignedCustomer?.contactId ?? null}
                    assignedPortalCustomerId={assignedCustomer?.portalCustomerId ?? null}
                    assignedCustomerLabel={assignedCustomer?.name ?? null}
                    holdOrderLabel={activeHeldOrder ? "Put Back On Hold" : "Hold Order"}
                    clearCartLabel={
                      isRedeemOnlyCart
                        ? "Clear Redemption Cart"
                        : activeHeldOrder
                        ? "Cancel Held Order"
                        : "Clear Cart"
                    }
                    heldOrderName={activeHeldOrder?.customer_name ?? null}
                    holding={holding}
                    onAfterPaymentCompleted={handleAfterPaymentCompleted}
                    isPrepaidRedeem={isRedeemOnlyCart}
                    prepaidLabel={redeemSessionLabel}
                    onRedeemPrepaidInvoice={redeemLoadedItemsFromCart}
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

      <CouponDecisionModal
        isOpen={Boolean(scanDecision)}
        currentCoupons={appliedCoupons.map((c, idx) => getCouponDisplayName(c, `Coupon ${idx + 1}`))}
        scannedCouponName={scanDecision?.scannedName || "Coupon"}
        combineAvailable={Boolean(scanDecision?.combineAvailable)}
        onClose={() => setScanDecision(null)}
        onOverride={handleOverrideScannedCoupon}
        onCombine={handleCombineScannedCoupon}
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
