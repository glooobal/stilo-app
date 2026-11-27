import { Host, Menu, Section, Text, Toggle } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  menuActionDismissBehavior,
} from '@expo/ui/swift-ui/modifiers';

import { BENCHMARK_IDS, BENCHMARKS } from '@/lib/benchmarks';

import { toggleBenchmark, type BenchmarkMenuProps } from './benchmark-menu.types';

/**
 * Native iOS pull-down menu with a checkmark next to every index on the
 * chart; it stays open, so several can be ticked in one go.
 */
export function BenchmarkMenu({
  selected,
  onChange,
  withDividends,
  onWithDividendsChange,
}: BenchmarkMenuProps) {
  return (
    <Host matchContents>
      <Menu
        label="Indeksy"
        systemImage="checklist"
        modifiers={[buttonStyle('bordered'), buttonBorderShape('capsule'), controlSize('small')]}>
        <Section title="Porównaj z">
          {BENCHMARKS.map((benchmark) => (
            <Toggle
              key={benchmark.id}
              isOn={selected.includes(benchmark.id)}
              onIsOnChange={(isOn) =>
                onChange(toggleBenchmark(BENCHMARK_IDS, selected, benchmark.id, isOn))
              }
              modifiers={[menuActionDismissBehavior('disabled')]}>
              <Text>{benchmark.name}</Text>
              <Text>{benchmark.description}</Text>
            </Toggle>
          ))}
        </Section>
        <Section>
          <Toggle
            isOn={withDividends}
            onIsOnChange={onWithDividendsChange}
            modifiers={[menuActionDismissBehavior('disabled')]}>
            <Text>Wliczaj dywidendy do wyników</Text>
            <Text>Dla portfela i wszystkich indeksów</Text>
          </Toggle>
        </Section>
      </Menu>
    </Host>
  );
}
