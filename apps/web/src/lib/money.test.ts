import { formatUsd, maskAmount, unmaskAmount, validateAmount } from './money';

describe('validateAmount', () => {
  it.each([
    ['150.25', '150.25'],
    ['10.5', '10.50'],
    ['7', '7.00'],
    ['  12.30 ', '12.30'],
    ['10000', '10000.00'],
    ['10000.00', '10000.00'],
  ])('accepts %j and normalizes it to %s', (input, amount) => {
    expect(validateAmount(input)).toEqual({ ok: true, amount });
  });

  it.each([
    ['', 'Ingresa un monto.'],
    ['0', 'El monto debe ser mayor a 0.'],
    ['0.00', 'El monto debe ser mayor a 0.'],
    ['10000.01', 'El monto máximo por operación es 10,000.00 USD.'],
    ['10001', 'El monto máximo por operación es 10,000.00 USD.'],
    ['10,50', 'Usa punto para los decimales, por ejemplo 150.25.'],
  ])('rejects %j with a clear message', (input, message) => {
    expect(validateAmount(input)).toMatchObject({ ok: false, message });
  });

  it.each([
    ['', 'empty'],
    ['abc', 'format'],
    ['10.123', 'decimals'],
    ['0', 'zero'],
    ['10000.01', 'over-limit'],
  ])('classifies %j as %s', (input, reason) => {
    expect(validateAmount(input)).toMatchObject({ ok: false, reason });
  });

  it.each(['10.123', 'abc', '-5', '1e3', '.5', '01.00', '$10'])('rejects malformed input %j', (input) => {
    expect(validateAmount(input).ok).toBe(false);
  });
});

describe('maskAmount / unmaskAmount', () => {
  it.each([
    ['', ''],
    ['abc', ''],
    ['12a3', '123'],
    ['1234', '1,234'],
    ['12345', '12,345'],
    ['123456', '12,345'],
    ['1,234.5', '1,234.5'],
    ['10.123', '10.123'],
    ['10.1234', '10.123'],
    ['1.2.3', '1.23'],
    ['.5', '0.5'],
    ['.', '0.'],
    ['007', '7'],
    ['0.05', '0.05'],
    ['$ 99.9', '99.9'],
  ])('masks %j as %j', (input, masked) => {
    expect(maskAmount(input)).toBe(masked);
  });

  it('round-trips into a value validateAmount accepts', () => {
    expect(validateAmount(unmaskAmount(maskAmount('10000.00')))).toEqual({ ok: true, amount: '10000.00' });
    expect(validateAmount(unmaskAmount(maskAmount('12345')))).toMatchObject({ ok: false });
  });
});

describe('formatUsd', () => {
  it.each([
    ['0.00', '$0.00'],
    ['150.25', '$150.25'],
    ['1234567.5', '$1,234,567.50'],
    ['10000', '$10,000.00'],
  ])('formats %s as %s', (amount, text) => {
    expect(formatUsd(amount)).toBe(text);
  });
});
