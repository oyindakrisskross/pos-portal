import React from "react";

interface CouponDecisionModalProps {
  isOpen: boolean;
  currentCoupons: string[];
  scannedCouponName: string;
  combineAvailable: boolean;
  onClose: () => void;
  onOverride: () => void;
  onCombine: () => void;
}

export const CouponDecisionModal: React.FC<CouponDecisionModalProps> = ({
  isOpen,
  currentCoupons,
  scannedCouponName,
  combineAvailable,
  onClose,
  onOverride,
  onCombine,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-kk-border-strong/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-kk-pri-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-lg font-semibold text-kk-pri-text">Coupon Detected</div>
        <p className="text-sm text-kk-sec-text">
          Current: {currentCoupons.join(", ")}
        </p>
        <p className="mt-1 text-sm text-kk-sec-text">
          Scanned: {scannedCouponName}
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-md border border-kk-border-strong px-3 py-2 text-sm font-medium text-kk-pri-text cursor-pointer"
            onClick={onOverride}
          >
            Override Current
          </button>
          {combineAvailable ? (
            <button
              type="button"
              className="flex-1 rounded-md bg-kk-acc px-3 py-2 text-sm font-semibold text-kk-pri-bg cursor-pointer"
              onClick={onCombine}
            >
              Combine
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-md bg-kk-sec-bg px-3 py-2 text-sm font-medium text-kk-sec-text cursor-pointer"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};
