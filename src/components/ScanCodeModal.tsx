import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LoaderCircle, ScanLine } from "lucide-react";

type Props = {
  isOpen: boolean;
  title: string;
  subtitle: string;
  confirmLabel?: string;
  onClose: () => void;
  onCode: (raw: string) => Promise<{ ok: boolean; error?: string }>;
};

export const ScanCodeModal: React.FC<Props> = ({
  isOpen,
  title,
  subtitle,
  confirmLabel = "Go Back",
  onClose,
  onCode,
}) => {
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef<string>("");
  const lastKeyAtRef = useRef<number>(0);
  const scanModeRef = useRef<boolean>(false);
  const idleSubmitTimerRef = useRef<number | null>(null);
  const busyRef = useRef<boolean>(false);
  const scanDetectedRef = useRef<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanDetected, setScanDetected] = useState(false);

  const handleSubmit = async (raw: string) => {
    const text = String(raw || "").trim();
    if (!text) return;
    busyRef.current = true;
    setBusy(true);
    scanDetectedRef.current = true;
    setScanDetected(true);
    setError(null);
    try {
      const res = await onCode(text);
      if (!res.ok) {
        setError(res.error || "Unable to apply code.");
        return;
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Unable to apply code.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      scanDetectedRef.current = false;
      setScanDetected(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      busyRef.current = false;
      setBusy(false);
      scanDetectedRef.current = false;
      setScanDetected(false);
      bufferRef.current = "";
      scanModeRef.current = false;
      lastKeyAtRef.current = 0;
      if (idleSubmitTimerRef.current) {
        window.clearTimeout(idleSubmitTimerRef.current);
        idleSubmitTimerRef.current = null;
      }
      return;
    }

    setError(null);
    busyRef.current = false;
    setBusy(false);
    scanDetectedRef.current = false;
    setScanDetected(false);
    bufferRef.current = "";
    scanModeRef.current = false;
    lastKeyAtRef.current = 0;

    const focusHiddenInput = () => {
      try {
        hiddenInputRef.current?.focus();
      } catch {
        // ignore
      }
    };

    focusHiddenInput();
    const focusTimer = window.setTimeout(focusHiddenInput, 50);

    const flush = () => {
      const value = bufferRef.current;
      bufferRef.current = "";
      scanModeRef.current = false;
      if (value.trim()) {
        void handleSubmit(value);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || busyRef.current) return;

      // Keep capturing even if the user clicks elsewhere.
      focusHiddenInput();

      if (e.key === "Escape") {
        e.preventDefault();
        scanDetectedRef.current = false;
        setScanDetected(false);
        onClose();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isScannerKey = e.key.length === 1 || e.key === "Enter" || e.key === "Backspace";
      if (isScannerKey && !scanDetectedRef.current) {
        scanDetectedRef.current = true;
        flushSync(() => setScanDetected(true));
      }

      const now = Date.now();
      const delta = lastKeyAtRef.current ? now - lastKeyAtRef.current : 0;
      lastKeyAtRef.current = now;

      // If keys arrive very quickly, assume this is a USB scanner (keyboard wedge).
      if (delta > 0 && delta < 60) {
        scanModeRef.current = true;
      } else if (delta > 250) {
        bufferRef.current = "";
        scanModeRef.current = false;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        flush();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        bufferRef.current = bufferRef.current.slice(0, -1);
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        bufferRef.current += e.key;

        if (idleSubmitTimerRef.current) {
          window.clearTimeout(idleSubmitTimerRef.current);
        }

        // If the scanner does not send Enter, submit after a short idle.
        idleSubmitTimerRef.current = window.setTimeout(() => {
          idleSubmitTimerRef.current = null;
          if (scanModeRef.current) flush();
        }, 300);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      if (idleSubmitTimerRef.current) {
        window.clearTimeout(idleSubmitTimerRef.current);
        idleSubmitTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kk-border-strong/60">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#d9d9d9] shadow-xl">
        <div className="px-6 pt-6 text-center">
          <h2 className="text-2xl font-bold text-black">{title}</h2>
          <p className="mt-1 text-sm text-black/70">{subtitle}</p>
        </div>

        <div className="px-6 py-5 flex flex-col items-center">
          {/* Hidden input: USB scanners act like keyboards (keyboard wedge). */}
          <input
            ref={hiddenInputRef}
            inputMode="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="absolute left-0 top-0 h-px w-px opacity-0"
            tabIndex={-1}
            aria-hidden="true"
            onChange={() => {
              // Intentionally no-op: we use key events so nothing is shown on screen.
            }}
          />

          <ScanLine className="w-25 h-25" />

          {scanDetected || busy ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-kk-border-strong bg-white/70 px-3 py-2 text-xs font-medium text-black">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>{busy ? "Processing scanned code..." : "Reading scanned code..."}</span>
            </div>
          ) : (
            <p className="mt-3 text-xs text-black/60">Waiting for scan...</p>
          )}

          {error && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            className="w-full rounded-md bg-black/15 py-2 text-sm font-semibold text-black disabled:opacity-60"
            onClick={onClose}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
