import { useMemo, useState } from "react";
import { formatMoney, parseDecimal } from "../helpers/posHelpers";
import type { POSSubscriptionPlan, POSSubscriptionProduct } from "../types/subscriptions";

interface SubscriptionProductPlansModalProps {
  isOpen: boolean;
  product: POSSubscriptionProduct | null;
  plans: POSSubscriptionPlan[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSelectPlan: (plan: POSSubscriptionPlan, quantity: number) => void;
}

export const SubscriptionProductPlansModal: React.FC<SubscriptionProductPlansModalProps> = ({
  isOpen,
  product,
  plans,
  loading = false,
  error = null,
  onClose,
  onSelectPlan,
}) => {
  const [quantityByPlan, setQuantityByPlan] = useState<Record<number, number>>({});

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [plans]
  );

  if (!isOpen || !product) return null;

  const getQty = (planId: number) => Math.max(1, Number(quantityByPlan[planId] ?? 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-kk-pri-bg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-xl font-semibold tracking-wide text-kk-pri-text">
            {product.name} Plans
          </h2>
          <button
            type="button"
            className="cursor-pointer text-xl leading-none text-kk-ter-text hover:text-kk-pri-text"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {loading ? <p className="text-sm text-kk-sec-text">Loading plans...</p> : null}
          {error ? <p className="text-sm font-medium text-kk-err">{error}</p> : null}
          {!loading && !error && !sortedPlans.length ? (
            <p className="text-sm text-kk-sec-text">No active plans available for this product.</p>
          ) : null}

          {sortedPlans.map((plan) => {
            const base = parseDecimal(plan.price, 0);
            const setup = parseDecimal(plan.setup_fee ?? "0", 0);
            const unitTotal = base + setup;
            const qty = getQty(plan.id);

            return (
              <div
                key={plan.id}
                className="rounded-lg border border-kk-border bg-kk-pri-bg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-kk-pri-text">{plan.name}</div>
                    <div className="text-xs text-kk-sec-text">Code: {plan.code}</div>
                    <div className="mt-1 text-xs text-kk-sec-text">
                      Billing: every {plan.billing_frequency_value} {String(plan.billing_frequency_unit || "").toLowerCase()}
                      {plan.billing_frequency_value === 1 ? "" : "s"}
                    </div>
                    <div className="text-xs text-kk-sec-text">
                      Type: {plan.plan_type === "USAGE" ? "Usage-based" : "Cycle-based"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-kk-acc">{formatMoney(unitTotal)}</div>
                    {setup > 0 ? (
                      <div className="text-[11px] text-kk-sec-text">
                        {formatMoney(base)} + {formatMoney(setup)} setup
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-kk-border-strong text-sm"
                      onClick={() =>
                        setQuantityByPlan((prev) => ({ ...prev, [plan.id]: Math.max(1, getQty(plan.id) - 1) }))
                      }
                    >
                      −
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold text-kk-pri-text">
                      {qty}
                    </span>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-kk-border-strong text-sm"
                      onClick={() =>
                        setQuantityByPlan((prev) => ({ ...prev, [plan.id]: getQty(plan.id) + 1 }))
                      }
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    className="cursor-pointer rounded-md bg-kk-acc px-4 py-2 text-sm font-semibold text-kk-pri-bg hover:bg-kk-hover"
                    onClick={() => onSelectPlan(plan, qty)}
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

