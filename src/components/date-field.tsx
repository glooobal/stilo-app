import { ListItem } from '@expo/ui';

import type { DateFieldProps } from './date-field.types';

/** Fallback for platforms without a native date picker (web). */
export function DateField({ label, value }: DateFieldProps) {
  return <ListItem trailing={value.toLocaleDateString('pl-PL')}>{label}</ListItem>;
}
