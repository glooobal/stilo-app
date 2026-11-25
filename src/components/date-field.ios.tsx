import { DatePicker } from '@expo/ui/swift-ui';

import type { DateFieldProps } from './date-field.types';

/** Native compact SwiftUI date row; must be rendered inside a `<Host>`. */
export function DateField({ label, value, maximumDate, onChange }: DateFieldProps) {
  return (
    <DatePicker
      title={label}
      selection={value}
      range={maximumDate ? { end: maximumDate } : undefined}
      displayedComponents={['date']}
      onDateChange={onChange}
    />
  );
}
