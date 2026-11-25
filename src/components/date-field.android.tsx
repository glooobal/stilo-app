import { ListItem } from '@expo/ui';
import { DatePickerDialog } from '@expo/ui/jetpack-compose';
import { useState } from 'react';

import type { DateFieldProps } from './date-field.types';

/** Row that opens the Material date picker dialog; must be inside a `<Host>`. */
export function DateField({ label, value, maximumDate, onChange }: DateFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <ListItem
        onPress={() => setIsOpen(true)}
        trailing={value.toLocaleDateString('pl-PL')}>
        {label}
      </ListItem>
      {isOpen ? (
        <DatePickerDialog
          initialDate={value.toISOString()}
          selectableDates={maximumDate ? { end: maximumDate } : undefined}
          confirmButtonLabel="OK"
          dismissButtonLabel="Anuluj"
          onDateSelected={(date) => {
            setIsOpen(false);
            onChange(date);
          }}
          onDismissRequest={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
