import type { InstrumentSearchResult } from './types';

/**
 * Curated starting suggestions in the buy sheet: large, frequently traded
 * companies, 7 from the Warsaw Stock Exchange and 3 from the US. A hand-picked
 * list (not live popularity data); update it as needed.
 */
export const POPULAR_INSTRUMENTS: InstrumentSearchResult[] = [
  { symbol: 'PKO.WA', name: 'PKO Bank Polski', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'PKN.WA', name: 'Orlen', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'PZU.WA', name: 'PZU', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'KGH.WA', name: 'KGHM Polska Miedź', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'CDR.WA', name: 'CD Projekt', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'ALE.WA', name: 'Allegro.eu', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'DNP.WA', name: 'Dino Polska', exchange: 'WSE', exchangeName: 'Warsaw', type: 'EQUITY' },
  { symbol: 'AAPL', name: 'Apple', exchange: 'NMS', exchangeName: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NMS', exchangeName: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NMS', exchangeName: 'NASDAQ', type: 'EQUITY' },
];
