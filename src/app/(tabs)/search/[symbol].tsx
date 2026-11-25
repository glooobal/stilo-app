import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { InstrumentDetails } from '@/components/instrument-details';
import { getSavedInstrument } from '@/db/instruments';
import { usePortfolioData } from '@/hooks/use-portfolio';
import type { Instrument, InstrumentType } from '@/market/types';

type Params = {
  symbol: string;
  name?: string;
  exchange?: string;
  exchangeName?: string;
  type?: string;
};

/** An instrument opened from search: price and chart, plus the position if the user holds it. */
export default function SearchInstrumentScreen() {
  const params = useLocalSearchParams<Params>();
  const { positions, saleResults } = usePortfolioData();
  const position = positions.find((item) => item.instrument.symbol === params.symbol);

  const instrument: Instrument = useMemo(
    () =>
      position?.instrument ??
      getSavedInstrument(params.symbol) ?? {
        symbol: params.symbol,
        name: params.name ?? params.symbol,
        exchange: params.exchange ?? '',
        exchangeName: params.exchangeName ?? '',
        type: (params.type === 'ETF' ? 'ETF' : 'EQUITY') as InstrumentType,
        // Not known until the first quote arrives.
        currency: '',
      },
    [position, params.symbol, params.name, params.exchange, params.exchangeName, params.type]
  );

  return <InstrumentDetails instrument={instrument} position={position} saleResults={saleResults} />;
}
