import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { maskAmount, unmaskAmount } from '../lib/money';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string;
  onValueChange: (masked: string) => void;
};

const SIGNIFICANT = /[\d.]/;

/** Index in `masked` right after its n-th digit or decimal point. */
function caretAfter(masked: string, significantCount: number): number {
  if (significantCount === 0) return 0;
  let seen = 0;
  for (let i = 0; i < masked.length; i += 1) {
    if (SIGNIFICANT.test(masked.charAt(i))) seen += 1;
    if (seen === significantCount) return i + 1;
  }
  return masked.length;
}

export function AmountInput({ value, onValueChange, ...inputProps }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Re-formatting a controlled input moves the caret to the end; put it back
  // after the same digit the user was editing.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && pendingCaret.current !== null && document.activeElement === input) {
      input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    let raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;

    // Spanish numeric keyboards type "," as the decimal separator. A comma the
    // user just typed (not one of the mask's own separators) becomes a point.
    const typedComma = raw.length === value.length + 1 && raw.charAt(caret - 1) === ',';
    if (typedComma && !unmaskAmount(value).includes('.')) {
      raw = `${raw.slice(0, caret - 1)}.${raw.slice(caret)}`;
    }

    const masked = maskAmount(raw);
    const significantBefore = raw.slice(0, caret).replace(/[^\d.]/g, '').length;
    pendingCaret.current = caretAfter(masked, significantBefore);
    onValueChange(masked);
  }

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
    />
  );
}
