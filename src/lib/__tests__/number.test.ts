import { decodeYahooPrice } from '@/market/yahoo';

import { formatDecimalInput, formatMoney, formatPrice, formatQuote, toExactString } from '../number';

// Intl puts a no-break space before the currency.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('toExactString', () => {
  it('keeps every decimal place', () => {
    expect(toExactString(0.38434)).toBe('0.38434');
    expect(toExactString(0.0021)).toBe('0.0021');
    expect(toExactString(21840)).toBe('21840');
    expect(toExactString(1.123456789)).toBe('1.123456789');
  });

  it('never uses exponent notation', () => {
    expect(toExactString(0.0000001)).toBe('0.0000001');
    expect(toExactString(1e21)).toBe('1000000000000000000000');
  });

  it('drops only the binary noise of arithmetic', () => {
    expect(toExactString(0.1 + 0.2)).toBe('0.3');
    expect(toExactString(0.002 + 0.0021 + 0.0046)).toBe('0.0087');
  });
});

describe('formatDecimalInput', () => {
  it('shows a saved value exactly, so editing does not change it', () => {
    expect(formatDecimalInput(0.38434)).toBe('0,38434');
    expect(formatDecimalInput(0.123456)).toBe('0,123456');
  });
});

describe('formatPrice', () => {
  it('shows all decimal places of a price, at least two', () => {
    expect(plain(formatPrice(5.996, 'PLN'))).toBe('5,996 zł');
    expect(plain(formatPrice(108.76, 'PLN'))).toBe('108,76 zł');
    expect(plain(formatPrice(100, 'PLN'))).toBe('100,00 zł');
    expect(plain(formatPrice(0.38434, 'PLN'))).toBe('0,38434 zł');
  });

  it('limits endless decimals of a division when asked', () => {
    expect(plain(formatPrice(400 / 3, 'PLN', 4))).toBe('133,3333 zł');
  });
});

describe('formatMoney', () => {
  it('shows amounts to the grosz', () => {
    expect(plain(formatMoney(823.368, 'PLN'))).toBe('823,37 zł');
  });
});

describe('decodeYahooPrice', () => {
  it('recovers the decimal price from a 32-bit float', () => {
    expect(decodeYahooPrice(Math.fround(27.81))).toBe(27.81);
    expect(decodeYahooPrice(Math.fround(5.996))).toBe(5.996);
    expect(decodeYahooPrice(Math.fround(21840))).toBe(21840);
  });

  it('leaves other values untouched', () => {
    expect(decodeYahooPrice(0.1)).toBe(0.1);
    expect(decodeYahooPrice(27.809999)).toBe(27.809999);
  });
});

describe('formatQuote', () => {
  it('drops the storage noise of downloaded prices', () => {
    expect(formatQuote(60.36000061035156, 'PLN')).toBe(formatPrice(60.36, 'PLN'));
    expect(formatQuote(2.1580000400543213, 'PLN')).toBe(formatPrice(2.158, 'PLN'));
    expect(formatQuote(0.0377, 'USD')).toBe(formatPrice(0.0377, 'USD'));
  });
});
