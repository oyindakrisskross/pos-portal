import React from "react";

interface Props {
  value: string;
  maxLength?: number;
  disabled?: boolean;
  onChange: (next: string) => void;
}

const btn =
  "h-12 rounded-lg border border-kk-border bg-kk-pri-bg text-kk-pri-text text-lg font-semibold appearance-none select-none transition-none hover:bg-kk-pri-bg active:bg-kk-pri-bg focus:bg-kk-pri-bg focus:outline-none [-webkit-tap-highlight-color:transparent] disabled:opacity-50 disabled:cursor-not-allowed";

export const PinPad: React.FC<Props> = ({
  value,
  maxLength = 6,
  disabled,
  onChange,
}) => {
  const push = (digit: string) => {
    if (disabled) return;
    if (value.length >= maxLength) return;
    onChange((value + digit).slice(0, maxLength));
  };

  const backspace = () => {
    if (disabled) return;
    if (!value.length) return;
    onChange(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled) return;
    onChange("");
  };

  const dots = Array.from({ length: maxLength }).map((_, i) => (
    <div
      key={i}
      className={`h-3 w-3 rounded-full ${
        i < value.length ? "bg-kk-acc" : "bg-kk-border"
      }`}
    />
  ));

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">{dots}</div>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            className={btn}
            disabled={disabled}
            onClick={() => push(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className={btn} disabled={disabled} onClick={clear}>
          Clear
        </button>
        <button
          type="button"
          className={btn}
          disabled={disabled}
          onClick={() => push("0")}
        >
          0
        </button>
        <button
          type="button"
          className={btn}
          disabled={disabled}
          onClick={backspace}
        >
          ⌫
        </button>
      </div>
    </div>
  );
};

