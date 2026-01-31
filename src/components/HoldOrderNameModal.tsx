import React, { useEffect, useRef, useState } from "react";

interface HoldOrderNameModalProps {
  isOpen: boolean;
  title?: string;
  initialName?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export const HoldOrderNameModal: React.FC<HoldOrderNameModalProps> = ({
  isOpen,
  title = "Name this held order",
  initialName = "",
  onClose,
  onConfirm,
}) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setError(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name.");
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="w-full max-w-md rounded-xl bg-kk-pri-bg shadow-xl">
        <div className="flex items-center justify-between px-5 py-6">
          <h2 className="text-xl tracking-wide font-semibold text-kk-pri-text">
            {title}
          </h2>
          <button
            type="button"
            className="text-xl leading-none text-kk-ter-text hover:text-kk-pri-text cursor-pointer"
            onClick={onClose}
          >
            Ã—
          </button>
        </div>

        <div className="px-5 pb-6 space-y-3">
          <div className="text-xs text-kk-ter-text">
            Example: Customer name, table, or a short note (e.g. “Ayo”, “Table 4”).
          </div>
          <input
            ref={inputRef}
            className="w-full rounded-md border border-kk-border-strong bg-kk-pri-bg px-3 py-2 text-sm text-kk-pri-text outline-none"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
          />
          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="flex-1 rounded-md border border-kk-border-strong bg-kk-pri-bg px-4 py-2 text-sm font-medium text-kk-pri-text cursor-pointer"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-md bg-kk-acc px-4 py-2 text-sm font-semibold text-kk-sec-bg cursor-pointer"
              onClick={submit}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

