import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CartLine, CartPricingSummary } from "../types/catalog";
import {
  buildPOSCheckoutRequest,
  buildPriceCartPreviewPayload,
  computeSubscriptionSaleSummary,
  parseCartPricingSummary,
  splitSubscriptionSaleLines,
  type BuildCheckoutContext,
  type PaymentMethodCode,
} from "../helpers/invoiceHelpers";
import type { AppliedCoupon, InvoiceResponse } from "../types/invoice";
import { checkOut, fetchPriceCart } from "../api/cart";
import { formatMoney } from "../helpers/posHelpers";
import { getAppliedCouponNames } from "../helpers/couponDisplay";
import { ChevronDown, CreditCard, ScanLine, Search, Smartphone } from "lucide-react";
import {
  createPortalCustomer,
  fetchPortalCustomers,
} from "../api/subscriptions";
import type { POSCustomerRecord } from "../types/subscriptions";
import { ScanCodeModal } from "./ScanCodeModal";

interface ProcessPaymentModalProps {
  isOpen: boolean;
  locationId: number;
  cart: CartLine[];
  appliedCoupons?: AppliedCoupon[];
  customerId?: number | null;
  portalCustomerId?: number | null;
  onClose: () => void;
  onPaymentCompleted: (invoice: InvoiceResponse | null) => void;
}

type UiPaymentMethod = "POS_TERMINAL" | "BANK_TRANSFER" | "QR_CODE";

type RequiredCardSerialEntry = {
  key: string;
  planId: number;
  planName: string;
  planCode: string;
  cardIndex: number;
  totalCards: number;
};

const uiToBackendMethod: Record<UiPaymentMethod, PaymentMethodCode> = {
  POS_TERMINAL: "CARD",
  BANK_TRANSFER: "TRANSFER",
  QR_CODE: "OTHER",
};

const buildCustomerLabel = (customer: POSCustomerRecord) => {
  const fullName = `${String(customer.first_name || "").trim()} ${String(customer.last_name || "").trim()}`.trim();
  return fullName || customer.email;
};

export const ProcessPaymentModal: React.FC<ProcessPaymentModalProps> = ({
  isOpen,
  locationId,
  cart,
  appliedCoupons: appliedCouponsProp = [],
  customerId = null,
  portalCustomerId = null,
  onClose,
  onPaymentCompleted,
}) => {
  const [pricing, setPricing] = useState<CartPricingSummary | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCoupon[]>(appliedCouponsProp ?? []);

  const [paymentMethod, setPaymentMethod] = useState<UiPaymentMethod>("POS_TERMINAL");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<POSCustomerRecord[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [selectedPortalCustomerId, setSelectedPortalCustomerId] = useState<number | null>(portalCustomerId ?? null);
  const [selectedPortalCustomer, setSelectedPortalCustomer] = useState<POSCustomerRecord | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [subscriptionCardSerials, setSubscriptionCardSerials] = useState<Record<string, string>>({});
  const [scanTargetSerialKey, setScanTargetSerialKey] = useState<string | null>(null);
  const customerDropdownRef = useRef<HTMLDivElement | null>(null);
  const customerSearchInputRef = useRef<HTMLInputElement | null>(null);

  const subscriptionSaleLines = useMemo(
    () => cart.filter((line) => Boolean(line.subscriptionSale)),
    [cart]
  );
  const standardSaleLines = useMemo(
    () => cart.filter((line) => !line.subscriptionSale),
    [cart]
  );
  const isSubscriptionCheckout = subscriptionSaleLines.length > 0;
  const isMixedCheckout = isSubscriptionCheckout && standardSaleLines.length > 0;
  const cartIsEmpty = cart.length === 0;
  const hasManualCoupon = (appliedCouponsProp ?? []).some((c) => Boolean(c?.code));
  const hasCheckoutSource = !cartIsEmpty || hasManualCoupon;
  const selectedCustomer = useMemo(() => {
    if (!selectedPortalCustomerId) return null;
    if (selectedPortalCustomer?.id === selectedPortalCustomerId) {
      return selectedPortalCustomer;
    }
    return customers.find((row) => Number(row.id) === Number(selectedPortalCustomerId)) ?? null;
  }, [customers, selectedPortalCustomer, selectedPortalCustomerId]);
  const requiredCardSerialEntries = useMemo<RequiredCardSerialEntry[]>(
    () =>
      subscriptionSaleLines.flatMap((line) => {
        const requiresCardSerial = Boolean(line.subscriptionSale?.requiresCardSerial);
        if (!requiresCardSerial) return [];
        const qty = Math.max(1, Number(line.quantity || 1));
        return Array.from({ length: qty }, (_, index) => ({
          key: `${line.id}:${index}`,
          planId: Number(line.subscriptionSale?.planId || 0),
          planName: String(line.subscriptionSale?.planName || "Subscription"),
          planCode: String(line.subscriptionSale?.planCode || ""),
          cardIndex: index + 1,
          totalCards: qty,
        }));
      }),
    [subscriptionSaleLines]
  );
  const duplicateCardSerial = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of requiredCardSerialEntries) {
      const normalized = String(subscriptionCardSerials[entry.key] || "").trim().toUpperCase();
      if (!normalized) continue;
      const scopedKey = `${entry.planId}:${normalized}`;
      if (seen.has(scopedKey)) return `${normalized} (${entry.planName})`;
      seen.add(scopedKey);
    }
    return null;
  }, [requiredCardSerialEntries, subscriptionCardSerials]);

  const apiErrorMessage = (err: any, fallback: string) => {
    const data = err?.response?.data;
    const normalize = (message: string) => {
      const text = String(message || "").trim();
      const lowered = text.toLowerCase();
      if (
        lowered.includes("physical card serial") ||
        lowered.includes("card serial number is already in use") ||
        lowered.includes("uniq_subscription_plan_card_serial") ||
        lowered.includes("duplicate key value violates unique constraint") ||
        lowered.includes("unique constraint failed")
      ) {
        return "This card serial number is already in use.";
      }
      return text;
    };
    if (typeof data === "string" && data.trim()) return normalize(data);
    if (data?.detail) return normalize(String(data.detail));
    if (data?.message) return normalize(String(data.message));
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      return normalize(String(data.non_field_errors[0]));
    }
    if (data && typeof data === "object") {
      for (const value of Object.values(data)) {
        if (typeof value === "string" && value.trim()) return normalize(value);
        if (Array.isArray(value) && value[0]) return normalize(String(value[0]));
      }
    }
    return normalize(err?.message || fallback);
  };

  useEffect(() => {
    if (!isOpen || !hasCheckoutSource) {
      setPricing(null);
      setPricingError(null);
      setAppliedCoupons(appliedCouponsProp ?? []);
      return;
    }

    const fetchPricing = async () => {
      try {
        setPricingLoading(true);
        setPricingError(null);

        const { subscriptionLines, standardLines } = splitSubscriptionSaleLines(cart);

        if (!standardLines.length && subscriptionLines.length) {
          const summary = computeSubscriptionSaleSummary(subscriptionLines);
          setPricing(summary);
          setAppliedCoupons([]);
          setAmountPaid(summary.grandTotal.toFixed(2));
          return;
        }

        const payload = buildPriceCartPreviewPayload(
          standardLines.length ? standardLines : cart,
          locationId,
          "AMOUNT",
          "0.00",
          !subscriptionLines.length ? appliedCouponsProp?.[0]?.code ?? "" : "",
          !subscriptionLines.length ? appliedCouponsProp.map((c) => c.code) : []
        );

        const data = await fetchPriceCart(payload);
        const regularSummary = parseCartPricingSummary(data);
        const subscriptionSummary = computeSubscriptionSaleSummary(subscriptionLines);
        const combinedSummary: CartPricingSummary = {
          subtotal: regularSummary.subtotal + subscriptionSummary.subtotal,
          taxTotal: regularSummary.taxTotal + subscriptionSummary.taxTotal,
          discountTotal: regularSummary.discountTotal + subscriptionSummary.discountTotal,
          grandTotal: regularSummary.grandTotal + subscriptionSummary.grandTotal,
        };

        setPricing(combinedSummary);
        if (subscriptionLines.length) {
          setAppliedCoupons([]);
        } else {
          setAppliedCoupons(
            (
              Array.isArray(data?.applied_coupons)
                ? data.applied_coupons
                : data?.applied_coupon
                  ? [data.applied_coupon]
                  : []
            ).filter((c: any) => c?.code) as AppliedCoupon[]
          );
        }
        setAmountPaid(combinedSummary.grandTotal.toFixed(2));
      } catch (err: any) {
        setPricingError(apiErrorMessage(err, "Unable to price cart."));
      } finally {
        setPricingLoading(false);
      }
    };

    fetchPricing();
  }, [appliedCouponsProp, cart, hasCheckoutSource, isOpen, isSubscriptionCheckout, locationId]);

  useEffect(() => {
    if (!isOpen || !isSubscriptionCheckout) return;

    let cancelled = false;
    const run = async () => {
      try {
        setCustomersLoading(true);
        setCustomersError(null);
        const data = await fetchPortalCustomers({
          search: customerSearch.trim() || undefined,
          page_size: 30,
          is_active: true,
        });
        if (cancelled) return;
        setCustomers(Array.isArray(data?.results) ? data.results : []);
      } catch (err: any) {
        if (cancelled) return;
        setCustomersError(apiErrorMessage(err, "Unable to load customers."));
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [customerSearch, isOpen, isSubscriptionCheckout]);

  useEffect(() => {
    if (!selectedPortalCustomerId) {
      setSelectedPortalCustomer(null);
      return;
    }
    const match = customers.find((row) => Number(row.id) === Number(selectedPortalCustomerId));
    if (match) {
      setSelectedPortalCustomer(match);
    }
  }, [customers, selectedPortalCustomerId]);

  useEffect(() => {
    if (!customerDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!customerDropdownRef.current?.contains(event.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCustomerDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (!customerDropdownOpen) return;
    customerSearchInputRef.current?.focus();
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (showNewCustomerForm) {
      setCustomerDropdownOpen(false);
    }
  }, [showNewCustomerForm]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPortalCustomerId(portalCustomerId ?? null);
    setSelectedPortalCustomer(null);
    setCustomerDropdownOpen(false);
    setShowNewCustomerForm(false);
    setCustomerSearch("");
    setCustomers([]);
    setCustomersError(null);
    setNewCustomerFirstName("");
    setNewCustomerLastName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setSubscriptionCardSerials({});
    setScanTargetSerialKey(null);
    setSubmitError(null);
  }, [isOpen, portalCustomerId]);

  const appliedCouponCodes = appliedCoupons.map((c) => c.code).filter(Boolean);
  const appliedCouponNames = getAppliedCouponNames(appliedCoupons);
  const grandTotal = pricing?.grandTotal ?? 0;
  const paidNumber = Number(amountPaid || 0);
  const hasValidPayment = paidNumber > 0 || (grandTotal <= 0 && paidNumber === 0);
  const hasValidSubscriptionPayment = !isSubscriptionCheckout || paidNumber >= grandTotal;

  const newCustomerFormValid = Boolean(
    newCustomerFirstName.trim() &&
      newCustomerLastName.trim() &&
      newCustomerEmail.trim() &&
      newCustomerPhone.trim()
  );
  const hasRequiredCustomer = !isSubscriptionCheckout
    ? true
    : showNewCustomerForm
      ? newCustomerFormValid
      : Boolean(selectedPortalCustomerId && selectedPortalCustomerId > 0);
  const hasRequiredCardSerials = requiredCardSerialEntries.every((entry) =>
    Boolean(String(subscriptionCardSerials[entry.key] || "").trim())
  );

  const canSubmit =
    hasCheckoutSource &&
    !submitting &&
    !pricingLoading &&
    !!pricing &&
    hasValidPayment &&
    hasValidSubscriptionPayment &&
    hasRequiredCustomer &&
    hasRequiredCardSerials &&
    !duplicateCardSerial;

  const resolvePortalCheckoutCustomer = async (): Promise<{
    portalId: number;
    contactId: number | null;
  }> => {
    let portalId = selectedPortalCustomerId;
    let contactId: number | null = customerId ?? null;

    if (showNewCustomerForm) {
      const created = await createPortalCustomer({
        first_name: newCustomerFirstName.trim(),
        last_name: newCustomerLastName.trim(),
        email: newCustomerEmail.trim(),
        phone: newCustomerPhone.trim(),
        is_active: true,
      });
      portalId = Number(created.id);
      contactId = created.contact_id ? Number(created.contact_id) : null;
      setSelectedPortalCustomerId(portalId);
      setSelectedPortalCustomer(created);
    } else if (portalId && portalId > 0) {
      const selected = selectedCustomer;
      if (selected?.contact_id) {
        contactId = Number(selected.contact_id);
      }
    }

    if (!portalId || portalId <= 0) {
      throw new Error("Customer selection is required for subscription checkout.");
    }
    return { portalId, contactId };
  };

  const handleSaleSubmit = async (
    checkoutCart: CartLine[],
    checkoutCustomerId: number | null,
    includeCoupons: boolean,
    subscriptionEntries?: Array<{ plan: number; physical_card_serial?: string | null }>
  ): Promise<InvoiceResponse> => {
    if (!canSubmit || !pricing) {
      throw new Error("Payment form is not ready.");
    }
    const ctx: BuildCheckoutContext = {
      locationId,
      discountType: "AMOUNT",
      discountValue: "0.00",
      paymentMethod: uiToBackendMethod[paymentMethod],
      amountPaid,
      customerId: checkoutCustomerId,
      subscriptionEntries,
      notes: "",
      couponCode: includeCoupons ? appliedCouponCodes[0] ?? "" : "",
      couponCodes: includeCoupons ? appliedCouponCodes : [],
    };
    const payload = buildPOSCheckoutRequest(checkoutCart, ctx);
    const invoice: InvoiceResponse = await checkOut(payload);
    return invoice;
  };

  const buildSubscriptionCheckoutEntries = (): Array<{
    plan: number;
    physical_card_serial?: string | null;
  }> => {
    const entries: Array<{ plan: number; physical_card_serial?: string | null }> = [];

    subscriptionSaleLines.forEach((line) => {
      const planId = Number(line.subscriptionSale?.planId || 0);
      if (!planId) return;

      const qty = Math.max(1, Number(line.quantity || 1));
      const requiresCardSerial = Boolean(line.subscriptionSale?.requiresCardSerial);

      for (let idx = 0; idx < qty; idx++) {
        const entry: { plan: number; physical_card_serial?: string | null } = { plan: planId };
        if (requiresCardSerial) {
          const serialKey = `${line.id}:${idx}`;
          const normalizedSerial = String(subscriptionCardSerials[serialKey] || "").trim();
          if (normalizedSerial) {
            entry.physical_card_serial = normalizedSerial;
          }
        }
        entries.push(entry);
      }
    });

    return entries;
  };

  const handleSubmit = async () => {
    if (!canSubmit || !pricing) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (isSubscriptionCheckout) {
        const selectedCustomer = await resolvePortalCheckoutCustomer();
        if (!selectedCustomer.contactId || selectedCustomer.contactId <= 0) {
          throw new Error("Selected customer is missing a linked contact record.");
        }
        const subscriptionEntries = buildSubscriptionCheckoutEntries();
        const invoice = await handleSaleSubmit(
          isMixedCheckout ? standardSaleLines : [],
          selectedCustomer.contactId,
          false,
          subscriptionEntries
        );
        onPaymentCompleted(invoice);
      } else {
        const invoice = await handleSaleSubmit(cart, customerId ?? null, true);
        onPaymentCompleted(invoice);
      }
    } catch (err: any) {
      setSubmitError(apiErrorMessage(err, "Unable to complete payment."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-kk-pri-bg shadow-xl">
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-xl font-semibold tracking-wide text-kk-pri-text">
            Process Payment
          </h2>
          <button
            type="button"
            className="cursor-pointer text-xl leading-none text-kk-ter-text hover:text-kk-pri-text"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <section className="rounded-xl bg-kk-sec-bg px-4 py-3">
            <h3 className="mb-2 text-base font-semibold text-kk-sec-text">Order Summary</h3>
            {pricingLoading ? <p className="text-base text-kk-sec-text">Loading...</p> : null}
            {pricingError ? <p className="text-xs text-kk-err">{pricingError}</p> : null}
            {pricing && !pricingLoading && !pricingError ? (
              <>
                <div className="flex justify-between text-sm text-kk-sec-text">
                  <span>Subtotal ({cart.length} items)</span>
                  <span>{formatMoney(pricing.subtotal)}</span>
                </div>
                {pricing.taxTotal > 0 ? (
                  <div className="mt-1 flex justify-between text-sm text-kk-sec-text">
                    <span>VAT (7.5%)</span>
                    <span>{formatMoney(pricing.taxTotal)}</span>
                  </div>
                ) : null}
                {pricing.discountTotal > 0 ? (
                  <div className="mt-1 flex justify-between text-sm text-kk-err">
                    <span>
                      {appliedCouponNames.length
                        ? `Coupon${appliedCouponNames.length > 1 ? "s" : ""} (${appliedCouponNames.join(", ")})`
                        : "Discount"}
                    </span>
                    <span>-{formatMoney(pricing.discountTotal)}</span>
                  </div>
                ) : null}
                <div className="mt-3 border-t pt-2 text-lg font-semibold text-kk-pri-text">
                  <div className="flex justify-between">
                    <span>Total Amount</span>
                    <span>{formatMoney(pricing.grandTotal)}</span>
                  </div>
                </div>
              </>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold text-kk-pri-text">Payment Method</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "POS_TERMINAL", label: "POS Terminal", icon: <CreditCard className="h-4 w-4" /> },
                { key: "BANK_TRANSFER", label: "Bank Transfer", icon: <Smartphone className="h-4 w-4" /> },
              ].map((opt) => {
                const active = paymentMethod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`flex flex-col items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${
                      active
                        ? "border-kk-acc bg-kk-acc text-kk-pri-bg"
                        : "border-kk-border bg-kk-pri-bg text-kk-pri-text"
                    } cursor-pointer`}
                    onClick={() => setPaymentMethod(opt.key as UiPaymentMethod)}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {isSubscriptionCheckout ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-kk-pri-text">Customer (Required)</h3>
                <button
                  type="button"
                  className="cursor-pointer text-xs font-semibold text-kk-hover underline"
                  onClick={() => {
                    setCustomerDropdownOpen(false);
                    setShowNewCustomerForm((prev) => !prev);
                  }}
                >
                  {showNewCustomerForm ? "Select Existing Customer" : "New Customer"}
                </button>
              </div>

              {!showNewCustomerForm ? (
                <div className="space-y-2">
                  <div className="relative" ref={customerDropdownRef}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-md border border-kk-border px-3 py-2 text-left text-sm"
                      onClick={() => setCustomerDropdownOpen((prev) => !prev)}
                      aria-expanded={customerDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span
                        className={`truncate ${selectedPortalCustomerId ? "text-kk-pri-text" : "text-kk-ter-text"}`}
                      >
                        {selectedCustomer
                          ? `${buildCustomerLabel(selectedCustomer)} - ${selectedCustomer.email}`
                          : selectedPortalCustomerId
                            ? `Customer #${selectedPortalCustomerId}`
                            : "Select a customer"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-kk-ter-text transition-transform ${
                          customerDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {customerDropdownOpen ? (
                      <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-kk-border bg-kk-pri-bg shadow-xl">
                        <div className="border-b border-kk-border p-2">
                          <div className="flex items-center gap-2 rounded-md border border-kk-border px-3 py-2">
                            <Search className="h-4 w-4 text-kk-ter-text" />
                            <input
                              ref={customerSearchInputRef}
                              type="text"
                              className="w-full bg-transparent text-sm text-kk-pri-text outline-none placeholder:text-kk-ter-text"
                              placeholder="Search customer by name, phone, or email..."
                              value={customerSearch}
                              onChange={(e) => setCustomerSearch(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="max-h-60 overflow-y-auto py-1">
                          <button
                            type="button"
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-kk-sec-bg ${
                              !selectedPortalCustomerId ? "bg-kk-sec-bg text-kk-pri-text" : "text-kk-sec-text"
                            }`}
                            onClick={() => {
                              setSelectedPortalCustomerId(null);
                              setSelectedPortalCustomer(null);
                              setCustomerSearch("");
                              setCustomerDropdownOpen(false);
                            }}
                          >
                            Select a customer
                          </button>

                          {customersLoading ? (
                            <p className="px-3 py-3 text-xs text-kk-sec-text">Loading customers...</p>
                          ) : null}

                          {!customersLoading && customers.length
                            ? customers.map((customer) => {
                                const isActive = Number(customer.id) === Number(selectedPortalCustomerId);
                                return (
                                  <button
                                    key={customer.id}
                                    type="button"
                                    className={`w-full px-3 py-2 text-left hover:bg-kk-sec-bg ${
                                      isActive ? "bg-kk-sec-bg" : ""
                                    }`}
                                    onClick={() => {
                                      setSelectedPortalCustomerId(Number(customer.id));
                                      setSelectedPortalCustomer(customer);
                                      setCustomerSearch("");
                                      setCustomerDropdownOpen(false);
                                    }}
                                  >
                                    <p className="truncate text-sm font-medium text-kk-pri-text">
                                      {buildCustomerLabel(customer)}
                                    </p>
                                    <p className="truncate text-xs text-kk-sec-text">{customer.email}</p>
                                  </button>
                                );
                              })
                            : null}

                          {!customersLoading && !customers.length ? (
                            <p className="px-3 py-3 text-xs text-kk-sec-text">No customers found.</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <select
                    className="hidden"
                    aria-hidden="true"
                    value={selectedPortalCustomerId ?? ""}
                    onChange={(e) => setSelectedPortalCustomerId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {buildCustomerLabel(customer)} · {customer.email}
                      </option>
                    ))}
                  </select>
                  {customersError ? <p className="text-xs text-kk-err">{customersError}</p> : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    className="rounded-md border border-kk-border px-3 py-2 text-sm"
                    placeholder="First name"
                    value={newCustomerFirstName}
                    onChange={(e) => setNewCustomerFirstName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="rounded-md border border-kk-border px-3 py-2 text-sm"
                    placeholder="Last name"
                    value={newCustomerLastName}
                    onChange={(e) => setNewCustomerLastName(e.target.value)}
                  />
                  <input
                    type="email"
                    className="rounded-md border border-kk-border px-3 py-2 text-sm"
                    placeholder="Email address"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                  />
                  <input
                    type="tel"
                    className="rounded-md border border-kk-border px-3 py-2 text-sm"
                    placeholder="Phone number"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                </div>
              )}
            </section>
          ) : null}

          {requiredCardSerialEntries.length ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-kk-pri-text">Physical Card Serials</h3>
                <p className="mt-1 text-sm text-kk-sec-text">
                  Enter or scan the serial for each physical subscription card before completing checkout.
                </p>
              </div>

              <div className="space-y-3">
                {requiredCardSerialEntries.map((entry) => (
                  <div key={entry.key} className="rounded-xl border border-kk-border bg-kk-sec-bg p-3">
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-kk-pri-text">
                        {entry.planName}
                        {entry.planCode ? ` (${entry.planCode})` : ""}
                      </p>
                      <p className="text-xs text-kk-sec-text">
                        Card {entry.cardIndex} of {entry.totalCards}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full rounded-md border border-kk-border px-3 py-2 text-sm"
                        placeholder="Type or scan physical card serial"
                        value={subscriptionCardSerials[entry.key] ?? ""}
                        onChange={(e) =>
                          setSubscriptionCardSerials((current) => ({
                            ...current,
                            [entry.key]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md border border-kk-border px-3 py-2 text-sm font-medium text-kk-pri-text"
                        onClick={() => setScanTargetSerialKey(entry.key)}
                      >
                        <ScanLine className="h-4 w-4" />
                        <span>Scan</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {duplicateCardSerial ? (
                <p className="text-xs font-semibold text-kk-err">
                  Physical card serials must be unique within the same subscription plan. Duplicate detected:{" "}
                  {duplicateCardSerial}
                </p>
              ) : null}
            </section>
          ) : null}

          {submitError ? <p className="text-xs font-semibold text-kk-err">{submitError}</p> : null}
        </div>

        <div className="flex items-center gap-4 border-t border-kk-border px-6 py-4">
          <button
            type="button"
            className="flex-1 cursor-pointer rounded-lg border border-kk-border px-4 py-2 text-sm font-medium text-kk-sec-text transition-all duration-300 hover:bg-red-500 hover:text-kk-sec-bg"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-kk-pri-bg transition-all duration-300 ${
              canSubmit ? "bg-kk-acc hover:bg-kk-hover" : "bg-kk-ter-bg"
            }`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Completing..." : "Complete Payment"}
          </button>
        </div>
      </div>

      <ScanCodeModal
        isOpen={scanTargetSerialKey != null}
        title="Scan Physical Card"
        subtitle="Scan the physical card QR code to populate its serial number."
        onClose={() => setScanTargetSerialKey(null)}
        onCode={async (raw) => {
          const targetKey = scanTargetSerialKey;
          if (!targetKey) return { ok: false, error: "No serial field selected." };
          const nextValue = raw.trim();
          if (!nextValue) return { ok: false, error: "Scanned serial is empty." };
          setSubscriptionCardSerials((current) => ({ ...current, [targetKey]: nextValue }));
          return { ok: true };
        }}
      />
    </div>
  );
};
