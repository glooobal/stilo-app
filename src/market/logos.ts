import { PixelRatio } from 'react-native';

// Brandfetch Logo API. The client ID is meant to be public (it is part of
// every image URL), so it lives in an EXPO_PUBLIC_ variable in `.env.local`.
const CLIENT_ID = process.env.EXPO_PUBLIC_BRANDFETCH_CLIENT_ID;

/** Symbols without a logo in this session, so they are not requested again. */
const missingLogos = new Set<string>();

/**
 * Yahoo suffixes of the supported European exchanges. US listings have no
 * suffix (`NVDA`). Warsaw (`.WA`) is confirmed to work with Brandfetch; the
 * rest is being tested. A ticker Brandfetch does not know just shows the monogram.
 */
const EXCHANGE_SUFFIXES = [
  'WA', // Warsaw
  'DE', // Xetra
  'L', // London
  'IL', // London (international order book)
  'PA', // Paris
  'AS', // Amsterdam
  'BR', // Brussels
  'LS', // Lisbon
  'MI', // Milan
  'MC', // Madrid
  'SW', // SIX Swiss
  'VI', // Vienna
  'ST', // Stockholm
  'CO', // Copenhagen
  'HE', // Helsinki
  'OL', // Oslo
  'IC', // Iceland
  'IR', // Dublin
  'PR', // Prague
  'AT', // Athens
  'BD', // Budapest
];

const SUPPORTED_TICKER = new RegExp(`^[A-Z0-9][A-Z0-9-]*(\\.(${EXCHANGE_SUFFIXES.join('|')}))?$`);

/**
 * Instruments Brandfetch knows under another ticker than the market data
 * symbol (checked by hand). Add new ones here.
 */
const TICKER_OVERRIDES: Record<string, string> = {
  'GPW.WA': 'GPW.PL', // Giełda Papierów Wartościowych
  'DIA.WA': 'DIAGNOSTYKA.PL', // Diagnostyka
};

/**
 * Company websites, tried last: Brandfetch finds a logo by domain most
 * reliably when it does not know the ticker. Add new ones here.
 */
const DOMAIN_OVERRIDES: Record<string, string[]> = {
  'GPW.WA': ['gpw.pl'],
  'KRU.WA': ['kruk.eu', 'pl.kruk.eu'],
  'DIA.WA': ['diag.pl', 'grupadiagnostyka.pl'],
};

/**
 * Brandfetch ticker for a Yahoo symbol, or `null` for markets whose format
 * Brandfetch does not resolve yet (they show the monogram).
 */
function toBrandfetchTicker(symbol: string): string | null {
  const override = TICKER_OVERRIDES[symbol];
  if (override) return override;
  return SUPPORTED_TICKER.test(symbol) ? symbol : null;
}

/** Logo URL of a company by its website domain (e.g. a broker), or `null`. */
export function getBrandLogoUrl(domain: string, size: number): string | null {
  if (!CLIENT_ID) return null;
  const pixels = Math.min(2048, Math.max(16, PixelRatio.getPixelSizeForLayoutSize(size)));
  return `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/w/${pixels}/h/${pixels}/fallback/404?c=${CLIENT_ID}`;
}

function logoUrl(route: 'ticker' | 'domain', identifier: string, size: number) {
  const pixels = Math.min(2048, Math.max(16, PixelRatio.getPixelSizeForLayoutSize(size)));
  return `https://cdn.brandfetch.io/${route}/${encodeURIComponent(identifier)}/w/${pixels}/h/${pixels}/fallback/404?c=${CLIENT_ID}`;
}

/**
 * Logo URLs to try for an instrument, in order: the ticker (or its known
 * Brandfetch ticker), the plain market symbol, then the company website.
 * Empty without a client ID; URLs known to be missing are left out.
 * `fallback/404` lets the app show its own monogram instead of
 * Brandfetch's placeholder.
 */
export function getInstrumentLogoUrls(symbol: string, size: number): string[] {
  if (!CLIENT_ID) return [];
  const candidates: { key: string; url: string }[] = [];
  const add = (route: 'ticker' | 'domain', identifier: string | null | undefined) => {
    if (!identifier) return;
    const key = `${route}:${identifier}`;
    if (missingLogos.has(key) || candidates.some((item) => item.key === key)) return;
    candidates.push({ key, url: logoUrl(route, identifier, size) });
  };
  add('ticker', toBrandfetchTicker(symbol));
  add('ticker', SUPPORTED_TICKER.test(symbol) ? symbol : null);
  for (const domain of DOMAIN_OVERRIDES[symbol] ?? []) add('domain', domain);
  return candidates.map((item) => item.url);
}

/** The first logo URL to try (see `getInstrumentLogoUrls`). */
export function getInstrumentLogoUrl(symbol: string, size: number): string | null {
  return getInstrumentLogoUrls(symbol, size)[0] ?? null;
}

/** Remembers for this session that a logo URL has no logo. */
export function markLogoMissing(url: string) {
  const match = /cdn\.brandfetch\.io\/(ticker|domain)\/([^/]+)\//.exec(url);
  if (match) missingLogos.add(`${match[1]}:${decodeURIComponent(match[2])}`);
}
