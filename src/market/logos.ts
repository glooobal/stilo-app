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

/**
 * Logo URL for an instrument, or `null` when there is no client ID or the
 * logo is known to be missing. `fallback/404` lets the app show its own
 * monogram instead of Brandfetch's placeholder.
 */
export function getInstrumentLogoUrl(symbol: string, size: number): string | null {
  const ticker = toBrandfetchTicker(symbol);
  if (!CLIENT_ID || !ticker || missingLogos.has(symbol)) {
    return null;
  }
  const pixels = Math.min(2048, Math.max(16, PixelRatio.getPixelSizeForLayoutSize(size)));
  return `https://cdn.brandfetch.io/ticker/${encodeURIComponent(ticker)}/w/${pixels}/h/${pixels}/fallback/404?c=${CLIENT_ID}`;
}

export function markLogoMissing(symbol: string) {
  missingLogos.add(symbol);
}
