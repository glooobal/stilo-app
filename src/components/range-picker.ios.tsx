import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import type { ChartRange } from '@/market/types';

import { CHART_RANGES, rangeLabel, type RangePickerProps } from './range-picker.types';

/** Native SwiftUI segmented control with the chart ranges. */
export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <Picker<ChartRange>
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('segmented')]}>
        {CHART_RANGES.map((range) => (
          <Text key={range} modifiers={[tag(range)]}>
            {rangeLabel(range)}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
