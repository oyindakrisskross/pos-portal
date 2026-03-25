import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LoaderCircle,
  Mail,
  Phone,
  ScanLine,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  fetchLookupAssetDetail,
  lookupSubscriptionByPhysicalCard,
  resolveLookupContact,
  searchLookupContacts,
  verifyLookupContact,
  type POSLookupAssetDetail,
  type POSLookupContactRecord,
  type POSLookupPrepaidSummary,
  type POSLookupSubscriptionDetail,
  type POSLookupSubscriptionSummary,
  type POSLookupVerifyResponse,
} from "../api/contactLookup";
import { fetchSubscriptionPlans } from "../api/subscriptions";
import type { POSSubscriptionPlan } from "../types/subscriptions";
import { ScanCodeModal } from "./ScanCodeModal";

type LookupContactModalProps = {
  isOpen: boolean;
  locationId: number;
  onClose: () => void;
  onLoadSubscription: (token: string) => Promise<{ ok: boolean; error?: string }>;
  onLoadPrepaid: (prepaidNumber: string) => Promise<{ ok: boolean; error?: string }>;
};

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

const formatDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const looksLikeLookupCode = (value: string) => {
  const raw = value.trim().toUpperCase();
  if (!raw) return false;
  return (
    raw.startsWith("KK1:") ||
    raw.startsWith("CUSTOMER:") ||
    raw.startsWith("CUST:") ||
    raw.startsWith("EMPLOYEE:") ||
    raw.startsWith("EMP:") ||
    /^EMP[-_ ]?\d+$/i.test(raw) ||
    /^CUSTOMER[-_ ]?\d+$/i.test(raw)
  );
};

const InfoPill: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-kk-border bg-kk-sec-bg px-3 py-1 text-xs text-kk-sec-text">
    {icon}
    <span>{label}</span>
  </div>
);

export const LookupContactModal: React.FC<LookupContactModalProps> = ({
  isOpen,
  locationId,
  onClose,
  onLoadSubscription,
  onLoadPrepaid,
}) => {
  const [lookupMode, setLookupMode] = useState<"CONTACT" | "CARD">("CONTACT");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<POSLookupContactRecord[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resolvingCode, setResolvingCode] = useState(false);
  const [selectedContact, setSelectedContact] = useState<POSLookupContactRecord | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedProfile, setVerifiedProfile] = useState<POSLookupVerifyResponse | null>(null);
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [assetDetail, setAssetDetail] = useState<POSLookupAssetDetail | null>(null);
  const [cardPlanOptions, setCardPlanOptions] = useState<POSSubscriptionPlan[]>([]);
  const [cardPlansLoading, setCardPlansLoading] = useState(false);
  const [cardPlanId, setCardPlanId] = useState<number | "">("");
  const [cardSerial, setCardSerial] = useState("");
  const [cardLookupSubmitting, setCardLookupSubmitting] = useState(false);
  const [cardLookupError, setCardLookupError] = useState<string | null>(null);
  const [cardLookupResult, setCardLookupResult] = useState<POSLookupSubscriptionDetail | null>(null);
  const [showCardScanner, setShowCardScanner] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLookupMode("CONTACT");
      setQuery("");
      setResults([]);
      setResultsLoading(false);
      setResultsError(null);
      setResolvingCode(false);
      setSelectedContact(null);
      setVerifyInput("");
      setVerifySubmitting(false);
      setVerifyError(null);
      setVerifiedProfile(null);
      setDetailLoadingKey(null);
      setDetailError(null);
      setAssetDetail(null);
      setCardPlanOptions([]);
      setCardPlansLoading(false);
      setCardPlanId("");
      setCardSerial("");
      setCardLookupSubmitting(false);
      setCardLookupError(null);
      setCardLookupResult(null);
      setShowCardScanner(false);
      setRedeeming(false);
      setRedeemError(null);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || lookupMode !== "CONTACT" || selectedContact) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setResultsError(null);
      setResultsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setResultsLoading(true);
        setResultsError(null);
        const data = await searchLookupContacts(trimmed);
        if (cancelled) return;
        setResults(data);
      } catch (err: any) {
        if (cancelled) return;
        setResultsError(apiErrorMessage(err, "Unable to search contacts."));
      } finally {
        if (!cancelled) setResultsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, lookupMode, query, selectedContact]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const run = async () => {
      try {
        setCardPlansLoading(true);
        const data = await fetchSubscriptionPlans({ status: "ACTIVE", page_size: 300 });
        if (cancelled) return;
        setCardPlanOptions(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (cancelled) return;
        setCardPlanOptions([]);
      } finally {
        if (!cancelled) setCardPlansLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleCloseAll = () => {
    if (redeeming) return;
    onClose();
  };

  const resetCardLookup = () => {
    setCardLookupError(null);
    setCardLookupResult(null);
  };

  const handleSelectContact = (contact: POSLookupContactRecord) => {
    setSelectedContact(contact);
    setVerifyInput("");
    setVerifyError(null);
    setVerifiedProfile(null);
    setAssetDetail(null);
    setDetailError(null);
    setRedeemError(null);
  };

  const handleResolveCode = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setResolvingCode(true);
    setResultsError(null);
    try {
      const contact = await resolveLookupContact(trimmed);
      handleSelectContact(contact);
    } catch (err: any) {
      setResultsError(apiErrorMessage(err, "Unable to resolve lookup code."));
    } finally {
      setResolvingCode(false);
    }
  };

  const handleLookupPhysicalCard = async (serialOverride?: string) => {
    const selectedPlanId = Number(cardPlanId || 0);
    const normalizedSerial = String(serialOverride ?? cardSerial).trim();
    if (!selectedPlanId) {
      const error = "Select a subscription plan before searching by physical card.";
      setCardLookupError(error);
      return { ok: false, error };
    }
    if (!normalizedSerial) {
      const error = "Physical card serial is required.";
      setCardLookupError(error);
      return { ok: false, error };
    }

    setCardLookupSubmitting(true);
    setCardLookupError(null);
    setCardLookupResult(null);
    try {
      const detail = await lookupSubscriptionByPhysicalCard({
        planId: selectedPlanId,
        physicalCardSerial: normalizedSerial,
        locationId,
      });
      setCardSerial(normalizedSerial);
      setCardLookupResult(detail);
      return { ok: true };
    } catch (err: any) {
      const error = apiErrorMessage(err, "Unable to find a subscription for that physical card.");
      setCardLookupError(error);
      return { ok: false, error };
    } finally {
      setCardLookupSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedContact || !verifyInput.trim()) return;
    setVerifySubmitting(true);
    setVerifyError(null);
    setDetailError(null);
    try {
      const data = await verifyLookupContact(selectedContact.contact_id, verifyInput.trim());
      setVerifiedProfile(data);
      setSelectedContact(data.contact);
      setVerifyInput("");
    } catch (err: any) {
      setVerifyError(apiErrorMessage(err, "Unable to verify contact."));
    } finally {
      setVerifySubmitting(false);
    }
  };

  const handleOpenAsset = async (
    kind: "SUBSCRIPTION" | "PREPAID",
    assetId: number
  ) => {
    if (!verifiedProfile?.lookup_token) return;
    const loadingKey = `${kind}-${assetId}`;
    setDetailLoadingKey(loadingKey);
    setDetailError(null);
    setRedeemError(null);
    try {
      const detail = await fetchLookupAssetDetail({
        lookupToken: verifiedProfile.lookup_token,
        kind,
        assetId,
        locationId,
      });
      setAssetDetail(detail);
    } catch (err: any) {
      setDetailError(apiErrorMessage(err, "Unable to load redeemable details."));
    } finally {
      setDetailLoadingKey(null);
    }
  };

  const handleRedeemAsset = async () => {
    if (!assetDetail) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const result =
        assetDetail.kind === "SUBSCRIPTION"
          ? await onLoadSubscription(assetDetail.token)
          : await onLoadPrepaid(assetDetail.prepaid_number);
      if (!result.ok) {
        setRedeemError(result.error || "Unable to load redeemable items.");
        return;
      }
      onClose();
    } catch (err: any) {
      setRedeemError(apiErrorMessage(err, "Unable to load redeemable items."));
    } finally {
      setRedeeming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[65] flex items-center justify-center bg-kk-border-strong/60">
        <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-kk-pri-bg shadow-xl">
          <div className="flex items-start justify-between border-b border-kk-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-kk-pri-text">Lookup Contact</h2>
              <p className="mt-1 text-sm text-kk-sec-text">
                Look up by contact details or switch to physical card lookup for exact subscription-card matches.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full p-2 text-kk-sec-text transition-colors hover:bg-kk-sec-bg hover:text-kk-pri-text"
              onClick={handleCloseAll}
              disabled={redeeming}
              aria-label="Close lookup contact modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 min-h-0 flex-col gap-4 px-5 py-4">
            <div className="inline-flex rounded-xl border border-kk-border bg-kk-sec-bg p-1">
              {[
                { key: "CONTACT", label: "Lookup Contact" },
                { key: "CARD", label: "Lookup Physical Card" },
              ].map((option) => {
                const active = lookupMode === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-kk-pri-bg text-kk-pri-text shadow-sm" : "text-kk-sec-text"
                    }`}
                    onClick={() => {
                      setLookupMode(option.key as "CONTACT" | "CARD");
                      setResultsError(null);
                      setDetailError(null);
                      setRedeemError(null);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {lookupMode === "CONTACT" ? (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-kk-border bg-kk-sec-bg px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-kk-sec-text" />
                  <input
                    type="text"
                    className="w-full bg-transparent text-sm text-kk-pri-text outline-none placeholder:text-kk-ter-text"
                    placeholder="Search by name, phone number, or email address"
                    value={query}
                    autoFocus
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && looksLikeLookupCode(query)) {
                        e.preventDefault();
                        void handleResolveCode();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-kk-border bg-kk-pri-bg px-3 py-1.5 text-xs font-medium text-kk-pri-text disabled:opacity-60"
                    onClick={() => void handleResolveCode()}
                    disabled={!query.trim() || resolvingCode}
                    title="Resolve scanned QR code"
                  >
                    {resolvingCode ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                    <span>Resolve Code</span>
                  </button>
                </div>

                {resultsError ? (
                  <div className="rounded-lg border border-kk-err/30 bg-kk-err/5 px-3 py-2 text-sm text-kk-err">
                    {resultsError}
                  </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kk-border bg-kk-sec-bg">
                  <div className="border-b border-kk-border px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-kk-pri-text">
                      <UserRound className="h-4 w-4" />
                      <span>Matching Contacts</span>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {!query.trim() ? (
                      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                        <ScanLine className="h-10 w-10 text-kk-ter-text" />
                        <p className="mt-3 text-sm font-medium text-kk-pri-text">Ready to scan or search</p>
                        <p className="mt-1 max-w-md text-xs text-kk-sec-text">
                          Search results will show only the contact name, the last 6 digits of the phone number, and a masked email address.
                        </p>
                      </div>
                    ) : resultsLoading ? (
                      <div className="flex h-full items-center justify-center gap-2 px-6 py-12 text-sm text-kk-sec-text">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        <span>Searching contacts...</span>
                      </div>
                    ) : !results.length ? (
                      <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-kk-sec-text">
                        No contacts matched this search.
                      </div>
                    ) : (
                      <div className="divide-y divide-kk-border">
                        {results.map((contact) => (
                          <button
                            key={contact.contact_id}
                            type="button"
                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-kk-pri-bg"
                            onClick={() => handleSelectContact(contact)}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-kk-pri-text">{contact.name}</p>
                              <div className="mt-1 flex flex-wrap gap-3 text-xs text-kk-sec-text">
                                {contact.masked_phone ? <span>Phone ending {contact.masked_phone}</span> : null}
                                {contact.masked_email ? <span>{contact.masked_email}</span> : null}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-kk-ter-text" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="rounded-2xl border border-kk-border bg-kk-sec-bg p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="grid gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-kk-sec-text">Subscription Plan</span>
                        <select
                          value={cardPlanId}
                          onChange={(e) => {
                            setCardPlanId(e.target.value ? Number(e.target.value) : "");
                            resetCardLookup();
                          }}
                          className="rounded-lg border border-kk-border bg-kk-pri-bg px-3 py-2 text-sm text-kk-pri-text"
                        >
                          <option value="">{cardPlansLoading ? "Loading plans..." : "Select subscription plan"}</option>
                          {cardPlanOptions
                            .filter((plan) => Boolean(plan.uses_physical_card))
                            .map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name} ({plan.code})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-kk-sec-text">Physical Card Serial</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="w-full rounded-lg border border-kk-border bg-kk-pri-bg px-3 py-2 text-sm text-kk-pri-text outline-none"
                            placeholder="Type or scan physical card serial"
                            value={cardSerial}
                            onChange={(e) => {
                              setCardSerial(e.target.value);
                              resetCardLookup();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleLookupPhysicalCard();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-lg border border-kk-border bg-kk-pri-bg px-3 py-2 text-sm font-medium text-kk-pri-text"
                            onClick={() => setShowCardScanner(true)}
                          >
                            <ScanLine className="h-4 w-4" />
                            <span>Scan</span>
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-kk-acc px-4 py-2 text-sm font-semibold text-kk-pri-bg disabled:opacity-60 md:w-auto"
                        onClick={() => void handleLookupPhysicalCard()}
                        disabled={cardLookupSubmitting}
                      >
                        {cardLookupSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span>Find Card</span>
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-kk-sec-text">
                    Physical card lookup only returns exact serial matches for the selected subscription plan.
                  </p>
                </div>

                {cardLookupError ? (
                  <div className="rounded-lg border border-kk-err/30 bg-kk-err/5 px-3 py-2 text-sm text-kk-err">
                    {cardLookupError}
                  </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kk-border bg-kk-sec-bg">
                  <div className="border-b border-kk-border px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-kk-pri-text">
                      <ScanLine className="h-4 w-4" />
                      <span>Physical Card Match</span>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {!cardLookupResult ? (
                      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                        <ScanLine className="h-10 w-10 text-kk-ter-text" />
                        <p className="mt-3 text-sm font-medium text-kk-pri-text">Ready to search by physical card</p>
                        <p className="mt-1 max-w-md text-xs text-kk-sec-text">
                          Select the subscription plan, then type or scan the card serial to find its exact subscription match.
                        </p>
                      </div>
                    ) : (
                      <div className="p-4">
                        <button
                          type="button"
                          className="w-full rounded-xl border border-kk-border bg-kk-pri-bg px-4 py-3 text-left transition-colors hover:bg-kk-pri-bg/80"
                          onClick={() => {
                            setAssetDetail(cardLookupResult);
                            setRedeemError(null);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-kk-pri-text">
                                {cardLookupResult.plan_name}
                              </p>
                              <p className="mt-1 text-xs text-kk-sec-text">
                                {cardLookupResult.customer_name}
                              </p>
                              {cardLookupResult.physical_card_serial ? (
                                <p className="mt-1 text-xs text-kk-ter-text">
                                  Card serial: {cardLookupResult.physical_card_serial}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs text-kk-sec-text">
                                {cardLookupResult.remaining_uses === null
                                  ? "Unlimited remaining uses"
                                  : `${cardLookupResult.remaining_uses} use${cardLookupResult.remaining_uses === 1 ? "" : "s"} remaining`}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-kk-ter-text" />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedContact ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-kk-border-strong/45">
          <div className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-kk-pri-bg shadow-xl">
            <div className="flex items-start justify-between border-b border-kk-border px-5 py-4">
              <div>
                <button
                  type="button"
                  className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-kk-sec-text hover:text-kk-pri-text"
                  onClick={() => {
                    if (redeeming || verifySubmitting) return;
                    setSelectedContact(null);
                    setVerifiedProfile(null);
                    setAssetDetail(null);
                    setVerifyInput("");
                    setVerifyError(null);
                    setDetailError(null);
                    setRedeemError(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to results</span>
                </button>
                <h3 className="text-lg font-semibold text-kk-pri-text">
                  {verifiedProfile ? "Redeemable Assets" : "Verify Contact"}
                </h3>
                <p className="mt-1 text-sm text-kk-sec-text">
                  {verifiedProfile
                    ? "Protected contact details remain masked. Select a subscription or pre-paid invoice to continue."
                    : "Enter the full phone number or email address before viewing this contact's redeemable assets."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-kk-sec-text transition-colors hover:bg-kk-sec-bg hover:text-kk-pri-text"
                onClick={() => {
                  if (redeeming || verifySubmitting) return;
                  setSelectedContact(null);
                  setVerifiedProfile(null);
                  setAssetDetail(null);
                  setVerifyInput("");
                  setVerifyError(null);
                  setDetailError(null);
                  setRedeemError(null);
                }}
                aria-label="Close contact details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="rounded-2xl border border-kk-border bg-kk-sec-bg p-4">
                <p className="text-base font-semibold text-kk-pri-text">{selectedContact.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedContact.masked_phone ? (
                    <InfoPill icon={<Phone className="h-3.5 w-3.5" />} label={`Phone ending ${selectedContact.masked_phone}`} />
                  ) : null}
                  {selectedContact.masked_email ? (
                    <InfoPill icon={<Mail className="h-3.5 w-3.5" />} label={selectedContact.masked_email} />
                  ) : null}
                </div>
              </div>

              {!verifiedProfile ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-kk-border bg-kk-pri-bg p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-kk-pri-text">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verification Required</span>
                    </div>
                    <input
                      type="text"
                      className="mt-3 w-full rounded-lg border border-kk-border px-3 py-2 text-sm text-kk-pri-text outline-none"
                      placeholder="Full phone number or email address"
                      value={verifyInput}
                      autoFocus
                      onChange={(e) => setVerifyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleVerify();
                        }
                      }}
                    />
                    {verifyError ? <p className="mt-3 text-xs font-medium text-kk-err">{verifyError}</p> : null}
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg bg-kk-acc px-4 py-2 text-sm font-semibold text-kk-pri-bg disabled:opacity-60"
                        onClick={() => void handleVerify()}
                        disabled={!verifyInput.trim() || verifySubmitting}
                      >
                        {verifySubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        <span>Verify Contact</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {detailError ? (
                    <div className="rounded-lg border border-kk-err/30 bg-kk-err/5 px-3 py-2 text-sm text-kk-err">
                      {detailError}
                    </div>
                  ) : null}

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-kk-pri-text">Active Subscriptions</h4>
                      <span className="text-xs text-kk-sec-text">{verifiedProfile.subscriptions.length}</span>
                    </div>
                    {!verifiedProfile.subscriptions.length ? (
                      <div className="rounded-xl border border-dashed border-kk-border px-4 py-3 text-sm text-kk-sec-text">
                        No active subscriptions found for this contact.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {verifiedProfile.subscriptions.map((subscription: POSLookupSubscriptionSummary) => {
                          const loadingKey = `SUBSCRIPTION-${subscription.subscription_id}`;
                          return (
                            <button
                              key={subscription.subscription_id}
                              type="button"
                              className="w-full rounded-xl border border-kk-border bg-kk-pri-bg px-4 py-3 text-left transition-colors hover:bg-kk-sec-bg"
                              onClick={() => void handleOpenAsset("SUBSCRIPTION", subscription.subscription_id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-kk-pri-text">
                                    {subscription.plan_name}
                                  </p>
                                  <p className="mt-1 text-xs text-kk-sec-text">
                                    {subscription.remaining_uses === null
                                      ? "Unlimited remaining uses"
                                      : `${subscription.remaining_uses} use${subscription.remaining_uses === 1 ? "" : "s"} remaining`}
                                  </p>
                                  {subscription.physical_card_serial ? (
                                    <p className="mt-1 text-xs text-kk-ter-text">
                                      Card serial: {subscription.physical_card_serial}
                                    </p>
                                  ) : null}
                                  {formatDateTime(subscription.started_at) ? (
                                    <p className="mt-1 text-xs text-kk-ter-text">
                                      Started {formatDateTime(subscription.started_at)}
                                    </p>
                                  ) : null}
                                </div>
                                {detailLoadingKey === loadingKey ? (
                                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-kk-sec-text" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-kk-ter-text" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-kk-pri-text">Pre-Paid Invoices</h4>
                      <span className="text-xs text-kk-sec-text">{verifiedProfile.prepaids.length}</span>
                    </div>
                    {!verifiedProfile.prepaids.length ? (
                      <div className="rounded-xl border border-dashed border-kk-border px-4 py-3 text-sm text-kk-sec-text">
                        No redeemable pre-paid invoices found for this contact.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {verifiedProfile.prepaids.map((prepaid: POSLookupPrepaidSummary) => {
                          const loadingKey = `PREPAID-${prepaid.invoice_id}`;
                          return (
                            <button
                              key={prepaid.invoice_id}
                              type="button"
                              className="w-full rounded-xl border border-kk-border bg-kk-pri-bg px-4 py-3 text-left transition-colors hover:bg-kk-sec-bg"
                              onClick={() => void handleOpenAsset("PREPAID", prepaid.invoice_id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-kk-pri-text">
                                    {prepaid.prepaid_number}
                                  </p>
                                  <p className="mt-1 text-xs text-kk-sec-text">
                                    {prepaid.remaining_quantity} redeemable item{Number(prepaid.remaining_quantity) === 1 ? "" : "s"} remaining
                                  </p>
                                  <p className="mt-1 text-xs text-kk-ter-text">{prepaid.location_name}</p>
                                </div>
                                {detailLoadingKey === loadingKey ? (
                                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-kk-sec-text" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-kk-ter-text" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {assetDetail ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-kk-border-strong/45">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-kk-pri-bg shadow-xl">
            <div className="flex items-start justify-between border-b border-kk-border px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-kk-pri-text">
                  {assetDetail.kind === "SUBSCRIPTION" ? assetDetail.plan_name : assetDetail.prepaid_number}
                </h3>
                <p className="mt-1 text-sm text-kk-sec-text">
                  {assetDetail.kind === "SUBSCRIPTION"
                    ? "Review the eligible subscription items before loading them into the cart."
                    : "Review the remaining pre-paid items before loading them into the cart."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-kk-sec-text transition-colors hover:bg-kk-sec-bg hover:text-kk-pri-text"
                onClick={() => {
                  if (redeeming) return;
                  setAssetDetail(null);
                  setRedeemError(null);
                }}
                aria-label="Close asset detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {assetDetail.kind === "SUBSCRIPTION" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Customer</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">{assetDetail.customer_name}</p>
                    </div>
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Remaining Uses</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">
                        {assetDetail.remaining_uses === null ? "Unlimited" : assetDetail.remaining_uses}
                      </p>
                    </div>
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Status</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">{assetDetail.subscription_status}</p>
                    </div>
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Card Serial</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">
                        {assetDetail.physical_card_serial || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {assetDetail.lines.map((line) => (
                      <div
                        key={line.plan_item_id}
                        className="rounded-xl border border-kk-border bg-kk-pri-bg px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-kk-pri-text">{line.item_name}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-kk-sec-text">
                          <span>Max quantity: {line.max_quantity}</span>
                          <span>Interval: {line.interval_value} {line.interval_unit.toLowerCase()}</span>
                          {line.item_sku ? <span>SKU: {line.item_sku}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Invoice</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">{assetDetail.invoice_number}</p>
                    </div>
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Location</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">{assetDetail.location_name}</p>
                    </div>
                    <div className="rounded-xl border border-kk-border bg-kk-sec-bg px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-kk-ter-text">Remaining Quantity</p>
                      <p className="mt-1 text-sm font-semibold text-kk-pri-text">{assetDetail.remaining_quantity}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {assetDetail.lines.map((line) => (
                      <div
                        key={line.line_id}
                        className="rounded-xl border border-kk-border bg-kk-pri-bg px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-kk-pri-text">{line.item_name}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-kk-sec-text">
                          <span>Remaining: {line.remaining_quantity}</span>
                          <span>Redeemed: {line.redeemed_quantity}</span>
                          {line.item_sku ? <span>SKU: {line.item_sku}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-kk-border px-5 py-4">
              {redeemError ? <p className="mb-3 text-sm font-medium text-kk-err">{redeemError}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-kk-border px-4 py-2 text-sm font-medium text-kk-pri-text disabled:opacity-60"
                  onClick={() => {
                    if (redeeming) return;
                    setAssetDetail(null);
                    setRedeemError(null);
                  }}
                  disabled={redeeming}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-kk-acc px-4 py-2 text-sm font-semibold text-kk-pri-bg disabled:opacity-60"
                  onClick={() => void handleRedeemAsset()}
                  disabled={redeeming}
                >
                  {redeeming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  <span>{assetDetail.kind === "SUBSCRIPTION" ? "Redeem Subscription" : "Redeem Pre-Paid Invoice"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ScanCodeModal
        isOpen={showCardScanner}
        title="Scan Physical Card"
        subtitle="Select a subscription plan first, then scan the card QR code."
        onClose={() => setShowCardScanner(false)}
        onCode={async (raw) => {
          const nextValue = raw.trim();
          if (!nextValue) return { ok: false, error: "Scanned serial is empty." };
          setCardSerial(nextValue);
          return await handleLookupPhysicalCard(nextValue);
        }}
      />
    </>
  );
};
