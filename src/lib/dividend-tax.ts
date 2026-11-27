import type { AccountType } from '@/db/portfolios';

/**
 * Country of the company's market, from the market data symbol suffix
 * (`KRU.WA` → PL, `AAPL` → US).
 */
const COUNTRIES: Record<string, string> = {
  WA: 'PL',
  '': 'US',
  L: 'GB',
  IL: 'GB',
  DE: 'DE',
  PA: 'FR',
  AS: 'NL',
  BR: 'BE',
  LS: 'PT',
  MI: 'IT',
  MC: 'ES',
  SW: 'CH',
  VI: 'AT',
  ST: 'SE',
  CO: 'DK',
  HE: 'FI',
  OL: 'NO',
  IR: 'IE',
  PR: 'CZ',
  IC: 'IS',
  AT: 'GR',
  BD: 'HU',
};

/**
 * Tax usually withheld at source from a dividend paid to a Polish resident
 * (by the company's country, with the usual forms such as W-8BEN filed).
 * Estimates only, used to prefill dividends worked out by the app: the
 * user can change them, and imported dividends bring the real amounts.
 */
const WITHHOLDING_RATES: Record<string, number> = {
  US: 0.15,
  GB: 0,
  DE: 0.26375,
  FR: 0.128,
  NL: 0.15,
  BE: 0.3,
  PT: 0.25,
  IT: 0.26,
  ES: 0.19,
  CH: 0.35,
  AT: 0.275,
  SE: 0.3,
  DK: 0.27,
  FI: 0.35,
  NO: 0.25,
  IE: 0.25,
  CZ: 0.15,
  IS: 0.2,
  GR: 0.05,
  HU: 0,
};

/** Polish tax on dividends (withheld by the broker on a regular account). */
const POLISH_RATE = 0.19;

export function dividendCountry(symbol: string): string | null {
  const dot = symbol.lastIndexOf('.');
  const suffix = dot > 0 ? symbol.slice(dot + 1) : '';
  return COUNTRIES[suffix] ?? null;
}

/**
 * Default share of a dividend withheld as tax.
 *
 * - Polish companies: 19% on a regular account, nothing on IKE/IKZE.
 * - Foreign companies: the tax withheld at source in the company's country,
 *   also on IKE/IKZE (e.g. 15% in the US with W-8BEN). On a regular account
 *   the difference up to 19% is settled in the yearly tax return, not
 *   withheld, so it is not part of this rate.
 */
export function defaultDividendTaxRate(symbol: string, accountType: AccountType): number {
  const country = dividendCountry(symbol);
  if (country === 'PL') return accountType === 'standard' ? POLISH_RATE : 0;
  if (country == null) return 0;
  return WITHHOLDING_RATES[country] ?? 0;
}
