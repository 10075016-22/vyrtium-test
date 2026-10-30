import { describe, expect, it } from 'vitest';
import { assertSupportedCurrency, formatCents, parseAmountToCents } from '../src/balances/money.js';

describe('parseAmountToCents', () => {
  it.each([
    ['150.25', 15025],
    ['150.2', 15020],
    ['150', 15000],
    ['0.01', 1],
    ['0.10', 10],
    ['10000.00', 1_000_000],
    ['10000', 1_000_000],
  ])('parses %s to %i cents', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(['0', '0.00', '-5', '10.123', 'abc', '', ' 10', '10 ', '1e3', '01.00', '.50', '10.', '+5', '1,000.00', 'NaN'])(
    'rejects %j as INVALID_AMOUNT',
    (input) => {
      expect(() => parseAmountToCents(input)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT', status: 422 }));
    },
  );

  it.each(['10000.01', '999999999.99'])('rejects %s as AMOUNT_LIMIT_EXCEEDED', (input) => {
    expect(() => parseAmountToCents(input)).toThrow(
      expect.objectContaining({ code: 'AMOUNT_LIMIT_EXCEEDED', status: 422 }),
    );
  });

  it('rejects absurdly long numbers without precision loss', () => {
    expect(() => parseAmountToCents('99999999999999999999.99')).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
  });
});

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [30, '0.30'],
    [15025, '150.25'],
    [1_000_000, '10000.00'],
  ])('formats %i as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});

describe('assertSupportedCurrency', () => {
  it('accepts USD and rejects anything else, case-sensitively', () => {
    expect(() => {
      assertSupportedCurrency('USD');
    }).not.toThrow();
    for (const currency of ['EUR', 'usd', '']) {
      expect(() => {
        assertSupportedCurrency(currency);
      }).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_CURRENCY' }));
    }
  });
});
