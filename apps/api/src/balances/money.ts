import { AppError } from '../http/errors.js';

export const SUPPORTED_CURRENCY = 'USD';
export const MAX_AMOUNT_CENTS = 1_000_000; // 10,000.00 USD, inclusive

// Positive decimal with at most 2 fractional digits and no sign, exponent or
// leading zeros. The integer part is capped so the cents value can never
// approach Number.MAX_SAFE_INTEGER before the range check.
const AMOUNT_PATTERN = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/;

/**
 * Parses a decimal string into integer cents without going through floating
 * point (`Number("0.1")` style rounding never touches money).
 */
export function parseAmountToCents(amount: string): number {
  const match = AMOUNT_PATTERN.exec(amount);
  if (!match) {
    throw new AppError(
      422,
      'INVALID_AMOUNT',
      'Amount must be a positive number with at most 2 decimals, e.g. "150.25"',
    );
  }

  const [, units = '0', fraction = ''] = match;
  const cents = Number.parseInt(units, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0'), 10);

  if (cents <= 0) {
    throw new AppError(422, 'INVALID_AMOUNT', 'Amount must be greater than 0');
  }
  if (cents > MAX_AMOUNT_CENTS) {
    throw new AppError(422, 'AMOUNT_LIMIT_EXCEEDED', 'Amount exceeds the 10000.00 USD per-operation limit');
  }
  return cents;
}

export function assertSupportedCurrency(currency: string): void {
  if (currency !== SUPPORTED_CURRENCY) {
    throw new AppError(422, 'UNSUPPORTED_CURRENCY', 'Only USD is supported');
  }
}

/** Integer cents to a fixed 2-decimal string: 15025 -> "150.25". */
export function formatCents(cents: number): string {
  const units = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${units}.${fraction}`;
}
