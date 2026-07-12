import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> &
  Readonly<{
    value: number;
    onValueChange: (value: number) => void;
    formatValue?: (value: number) => string;
    parseValue?: (value: string) => number;
  }>;

const defaultFormat = (value: number): string => String(value);
const defaultParse = (value: string): number => Number(value);

export function NumberInput({
  value,
  onValueChange,
  formatValue = defaultFormat,
  parseValue = defaultParse,
  onBlur,
  onFocus,
  ...props
}: NumberInputProps) {
  const focusedRef = useRef(false);
  const formattedValue = formatValue(value);
  const [draft, setDraft] = useState(formattedValue);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formattedValue);
    }
  }, [formattedValue]);

  const commitDraft = (nextDraft: string) => {
    if (nextDraft.trim().length === 0) {
      return;
    }
    const parsed = parseValue(nextDraft);
    if (Number.isFinite(parsed)) {
      onValueChange(parsed);
    }
  };

  return (
    <input
      {...props}
      inputMode="decimal"
      onBlur={(event) => {
        focusedRef.current = false;
        commitDraft(event.currentTarget.value);
        setDraft(formatValue(value));
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextDraft = event.currentTarget.value;
        setDraft(nextDraft);
        commitDraft(nextDraft);
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      type="number"
      value={draft}
    />
  );
}
