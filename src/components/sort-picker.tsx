import { Host, Picker } from '@expo/ui';

import { POSITION_SORT_LABELS, POSITION_SORTS, type PositionSort } from '@/lib/position-sort';

/** Native menu picker (with a checkmark on the current option) for sorting positions. */
export function SortPicker({
  value,
  onChange,
}: {
  value: PositionSort;
  onChange: (sort: PositionSort) => void;
}) {
  return (
    <Host matchContents>
      <Picker<PositionSort>
        selectedValue={value}
        onValueChange={onChange}
        appearance="menu"
        accessibilityLabel="Sortuj pozycje">
        {POSITION_SORTS.map((option) => (
          <Picker.Item key={option} label={POSITION_SORT_LABELS[option]} value={option} />
        ))}
      </Picker>
    </Host>
  );
}
