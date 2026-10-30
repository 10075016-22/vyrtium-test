// Mirrors the API rules so invalid amounts never leave the browser.
const AMOUNT_PATTERN = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/;
const MAX_CENTS = 1_000_000;

export type AmountError = 'empty' | 'format' | 'zero' | 'over-limit';

export type AmountValidation = { ok: true; amount: string } | { ok: false; reason: AmountError; message: string };

/**
 * Validates user input and returns it normalized to 2 decimals ("10.5" -> "10.50").
 * Works on the string and integer cents only; no floating point.
 */
export function validateAmount(input: string): AmountValidation {
  const value = input.trim();
  if (value === '') return { ok: false, reason: 'empty', message: 'Ingresa un monto.' };

  const match = AMOUNT_PATTERN.exec(value);
  if (!match) {
    return {
      ok: false,
      reason: 'format',
      message: value.includes(',')
        ? 'Usa punto para los decimales, por ejemplo 150.25.'
        : 'Ingresa un monto válido con máximo 2 decimales, por ejemplo 150.25.',
    };
  }

  const [, units = '0', fraction = ''] = match;
  const cents = Number.parseInt(units, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0'), 10);
  if (cents <= 0) return { ok: false, reason: 'zero', message: 'El monto debe ser mayor a 0.' };
  if (cents > MAX_CENTS) {
    return { ok: false, reason: 'over-limit', message: 'El monto máximo por operación es 10,000.00 USD.' };
  }

  return { ok: true, amount: `${units}.${fraction.padEnd(2, '0')}` };
}

const MAX_INTEGER_DIGITS = 5; // enough to type 10001 and get the "maximum" message

/**
 * Input mask for amounts: keeps digits and one decimal point, caps decimals
 * at 2, drops leading zeros and groups thousands with commas.
 * "1234.567" -> "1,234.56", "abc" -> "", ".5" -> "0.5".
 */
export function maskAmount(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const rawUnits = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const fraction = dot === -1 ? undefined : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);

  let units = rawUnits.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS);
  if (units === '' && fraction !== undefined) units = '0';

  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Removes the mask's thousands separators: "1,234.5" -> "1234.5". */
export function unmaskAmount(masked: string): string {
  return masked.replace(/,/g, '');
}

/** "1234567.5" -> "$1,234,567.50" without converting the amount to a float. */
export function formatUsd(amount: string): string {
  const [units = '0', fraction = ''] = amount.split('.');
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
