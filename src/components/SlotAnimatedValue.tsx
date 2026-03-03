import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const DIGIT_SPIN_DURATION_MS = 760;
const DIGIT_STAGGER_MS = 95;
const DIGIT_SPIN_CYCLES = 3;
const NBSP = "\u00A0";

type TransitionState = {
  from: string;
  to: string;
  key: number;
  settleDurationMs: number;
};

type SlotAnimatedValueProps = {
  value: string;
  className?: string;
};

function isDigit(char: string) {
  return char >= "0" && char <= "9";
}

function charForDisplay(char: string) {
  return char === " " ? NBSP : char;
}

function splitPaddedChars(fromValue: string, toValue: string) {
  const width = Math.max(fromValue.length, toValue.length, 1);
  return {
    fromChars: fromValue.padStart(width, " ").split(""),
    toChars: toValue.padStart(width, " ").split(""),
  };
}

function buildDigitStrip(fromDigit: number, toDigit: number) {
  const delta = (toDigit - fromDigit + 10) % 10;
  const steps = DIGIT_SPIN_CYCLES * 10 + delta;
  const strip: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    strip.push(String((fromDigit + i) % 10));
  }
  return { strip, steps };
}

export function SlotAnimatedValue({ value, className }: SlotAnimatedValueProps) {
  const normalizedValue = value ?? "";
  const [displayValue, setDisplayValue] = useState(normalizedValue);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const animationIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const transitionTarget = transition?.to ?? null;

  useEffect(() => {
    const baseline = transitionTarget ?? displayValue;
    if (normalizedValue === baseline) return;

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const { fromChars, toChars } = splitPaddedChars(baseline, normalizedValue);
    const changedDigitIndexes = fromChars
      .map((fromChar, index) => (isDigit(toChars[index]) && fromChar !== toChars[index] ? index : null))
      .filter((index): index is number => index !== null);

    if (!changedDigitIndexes.length) {
      const nextTransition: TransitionState = {
        from: baseline,
        to: normalizedValue,
        key: animationIdRef.current++,
        settleDurationMs: 0,
      };
      setTransition(nextTransition);

      timeoutRef.current = window.setTimeout(() => {
        setDisplayValue(nextTransition.to);
        setTransition((current) => (current?.key === nextTransition.key ? null : current));
        timeoutRef.current = null;
      }, 0);
      return;
    }

    const maxDelayMs = (changedDigitIndexes.length - 1) * DIGIT_STAGGER_MS;
    const nextTransition: TransitionState = {
      from: baseline,
      to: normalizedValue,
      key: animationIdRef.current++,
      settleDurationMs: DIGIT_SPIN_DURATION_MS + maxDelayMs,
    };
    setTransition(nextTransition);

    timeoutRef.current = window.setTimeout(() => {
      setDisplayValue(nextTransition.to);
      setTransition((current) => (current?.key === nextTransition.key ? null : current));
      timeoutRef.current = null;
    }, nextTransition.settleDurationMs);
  }, [displayValue, normalizedValue, transitionTarget]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const { fromChars, toChars, delayByIndex } = useMemo(() => {
    const fromValue = transition?.from ?? displayValue;
    const toValue = transition?.to ?? displayValue;
    const { fromChars: nextFromChars, toChars: nextToChars } = splitPaddedChars(fromValue, toValue);

    const changedDigitIndexes = nextFromChars
      .map((fromChar, index) => (isDigit(nextToChars[index]) && fromChar !== nextToChars[index] ? index : null))
      .filter((index): index is number => index !== null)
      .sort((a, b) => a - b);

    const delayByIndex = new Map<number, number>();
    changedDigitIndexes.forEach((index, rank) => {
      delayByIndex.set(index, rank * DIGIT_STAGGER_MS);
    });

    return { fromChars: nextFromChars, toChars: nextToChars, delayByIndex };
  }, [displayValue, transition?.from, transition?.to]);

  return (
    <span className={className}>
      <span className="sr-only">{transition?.to ?? displayValue}</span>
      <span className="kk-pos-slot-value" aria-hidden="true">
        {toChars.map((toChar, index) => {
          const fromChar = fromChars[index] ?? " ";
          const digitChar = isDigit(toChar);
          const shouldSpin = !!transition && digitChar && fromChar !== toChar;
          const delayMs = delayByIndex.get(index) ?? 0;
          const displayTo = charForDisplay(toChar);

          if (!shouldSpin) {
            return (
              <span
                key={`${index}-static`}
                className={`kk-pos-slot-char ${digitChar ? "kk-pos-slot-char-digit" : "kk-pos-slot-char-symbol"}`}
              >
                {displayTo}
              </span>
            );
          }

          const toDigit = Number(toChar);
          const fromDigit = isDigit(fromChar) ? Number(fromChar) : toDigit;
          const { strip, steps } = buildDigitStrip(fromDigit, toDigit);
          const reelStyle = {
            "--kk-pos-slot-steps": String(steps),
            "--kk-pos-slot-duration": `${DIGIT_SPIN_DURATION_MS}ms`,
            "--kk-pos-slot-delay": `${delayMs}ms`,
          } as CSSProperties;

          return (
            <span
              key={`${index}-${transition.key}`}
              className="kk-pos-slot-char kk-pos-slot-char-digit kk-pos-slot-char-reel"
            >
              <span className="kk-pos-slot-reel-window">
                <span className="kk-pos-slot-reel-strip kk-pos-slot-reel-strip-spinning" style={reelStyle}>
                  {strip.map((digit, digitIndex) => (
                    <span key={`${index}-${transition.key}-${digitIndex}`} className="kk-pos-slot-reel-digit">
                      {digit}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
