export type DateFieldProps = {
  label: string;
  value: Date;
  maximumDate?: Date;
  onChange: (date: Date) => void;
};
