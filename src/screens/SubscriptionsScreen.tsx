import React, { useEffect, useMemo, useState } from "react";
import { fetchSubscriptionPlans, fetchSubscriptionProducts } from "../api/subscriptions";
import type { POSSubscriptionPlan, POSSubscriptionProduct } from "../types/subscriptions";
import { SubscriptionProductPlansModal } from "../components/SubscriptionProductPlansModal";

interface SubscriptionsScreenProps {
  onAddPlanToCart: (plan: POSSubscriptionPlan, product: POSSubscriptionProduct, quantity: number) => void;
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({ onAddPlanToCart }) => {
  const [products, setProducts] = useState<POSSubscriptionProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openProduct, setOpenProduct] = useState<POSSubscriptionProduct | null>(null);
  const [plans, setPlans] = useState<POSSubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSubscriptionProducts({
          status: "ACTIVE",
          search: search.trim() || undefined,
          page_size: 200,
        });
        if (cancelled) return;
        setProducts(Array.isArray(data?.results) ? data.results : []);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Unable to load subscription products.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [search]);

  useEffect(() => {
    if (!openProduct) {
      setPlans([]);
      setPlansError(null);
      return;
    }
    let cancelled = false;

    const loadPlans = async () => {
      setPlansLoading(true);
      setPlansError(null);
      try {
        const data = await fetchSubscriptionPlans({
          product: openProduct.id,
          status: "ACTIVE",
          page_size: 200,
        });
        if (cancelled) return;
        setPlans(Array.isArray(data?.results) ? data.results : []);
      } catch (err: any) {
        if (cancelled) return;
        setPlansError(err?.message || "Unable to load plans.");
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    };

    loadPlans();
    return () => {
      cancelled = true;
    };
  }, [openProduct]);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [products]
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded border border-kk-border px-3 py-2 text-sm focus:border-kk-acc focus:outline"
          placeholder="Search subscription products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        {!loading && !sortedProducts.length ? (
          <div className="mt-8 text-center text-xs text-kk-ter-text">
            No active subscription products found.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {sortedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex flex-col rounded-lg border border-kk-border bg-kk-pri-bg p-3 text-left shadow-sm transition hover:shadow-md"
                onClick={() => setOpenProduct(product)}
              >
                <div className="mb-2 flex h-28 items-center justify-center rounded-lg bg-kk-sec-bg">
                  <span className="line-clamp-3 px-2 text-center text-lg font-bold text-kk-pri-text">
                    {product.name}
                  </span>
                </div>
                <div className="line-clamp-2 text-sm font-medium text-kk-pri-text">{product.name}</div>
                {product.description ? (
                  <div className="mt-1 line-clamp-2 text-[11px] text-kk-sec-text">{product.description}</div>
                ) : null}
                <div className="mt-auto pt-2 text-[10px] text-kk-sec-text">Tap to view plans</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SubscriptionProductPlansModal
        isOpen={Boolean(openProduct)}
        product={openProduct}
        plans={plans}
        loading={plansLoading}
        error={plansError}
        onClose={() => setOpenProduct(null)}
        onSelectPlan={(plan, quantity) => {
          if (!openProduct) return;
          onAddPlanToCart(plan, openProduct, quantity);
          setOpenProduct(null);
        }}
      />
    </div>
  );
};

