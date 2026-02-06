// src/screens/PosScreen.tsx

import React, { useState, useEffect, useMemo } from "react";
import { fetchPOSItems } from "../api/catalog";
import type { POSItem, AddToCartPayload } from "../types/catalog";
import { SimplePosItemCard } from "../components/SimplePosItemCard";
import { PosItemGroupCard } from "../components/PosItemGroupCard";
import { PosItemGroupModal } from "../components/PosItemGroupModal";
import { PosItemCustomizeModal } from "../components/PosItemCustomizeModal";

interface PosScreenProps {
  locationId: number;
  onAddToCart: (payload: AddToCartPayload) => void;
}

export const PosScreen: React.FC<PosScreenProps> = ({
  locationId,
  onAddToCart
}) => {
  const [items, setItems] = useState<POSItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);

  const [openGroup, setOpenGroup] = useState<{
    groupName: string;
    items: POSItem[];
  } | null>(null);

  const [openCustomizeItem, setOpenCustomizeItem] = useState<POSItem | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchPOSItems({
          location_id: locationId,
          search: search.trim() || undefined,
        });
        if (!cancelled) {
          setItems(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load POS items.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadItems();
    return () => {
      cancelled = true;
    };
  }, [locationId, search, scheduleTick]);

  useEffect(() => {
    let timer: number | null = null;

    const scheduleNextTick = () => {
      const now = new Date();
      const msToNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      const delay = Math.max(msToNextMinute, 250);
      timer = window.setTimeout(() => {
        setScheduleTick((t) => t + 1);
        scheduleNextTick();
      }, delay);
    };

    scheduleNextTick();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const grouped = useMemo(() => {
    const byGroup: Record<string, POSItem[]> = {};
    const ungrouped: POSItem[] = [];

    for (const item of items) {
      if (item.group) {
        const key = `${item.group}::${item.group_name ?? ""}`;
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(item);
      } else {
        ungrouped.push(item);
      }
    }

    return { byGroup, ungrouped };
  }, [items]);

  const hasAnyItems =
    Object.keys(grouped.byGroup).length > 0 || grouped.ungrouped.length > 0;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded border border-kk-border px-3 py-2 text-sm focus:outline focus:border-kk-acc"
          placeholder="Search items by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-auto">
        {hasAnyItems ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {/* Grouped items as “Variants” cards */}
            {Object.entries(grouped.byGroup).map(([key, groupItems]) => {
              const [, groupName] = key.split("::");
              const displayName = groupName || groupItems[0]?.name || "Group";
              const inventory_tracking = groupItems[0]?.inventory_tracking;
              return (
                <PosItemGroupCard
                  key={key}
                  groupName={displayName}
                  inventoryTracking={inventory_tracking}
                  items={groupItems}
                  onOpen={() =>
                    setOpenGroup({
                      groupName: displayName,
                      items: groupItems,
                    })
                  }
                />
              );
            })}

            {/* Simple items (some may be customizable) */}
            {grouped.ungrouped.map((item) => (
              <SimplePosItemCard
                key={item.id}
                item={item}
                onAddToCart={onAddToCart}
                onClickItem={(clicked) => {
                  if (clicked.customized && clicked.customizations?.length) {
                    setOpenCustomizeItem(clicked);
                  } else {
                    // fallback: instant add
                    onAddToCart({
                      item: clicked,
                      quantity: 1,
                      customizations: [],
                    });
                  }
                }}
              />
            ))}
          </div>
        ) : (
          !loading &&
          !error && (
            <div className="mt-8 text-center text-xs text-kk-ter-text">
              No items available for this location / schedule.
            </div>
          )
        )}
      </div>

      {/* Variants modal */}
      {openGroup && (
        <PosItemGroupModal
          isOpen={true}
          groupName={openGroup.groupName}
          items={openGroup.items}
          onClose={() => setOpenGroup(null)}
          onAddToCart={onAddToCart}
        />
      )}

      {/* Customizable item modal */}
      {openCustomizeItem && (
        <PosItemCustomizeModal
          isOpen={true}
          item={openCustomizeItem}
          onClose={() => setOpenCustomizeItem(null)}
          onAddToCart={onAddToCart}
        />
      )}
    </div>
  );
};
