import { Host, Menu, Picker, Section, Text } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, labelStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

/**
 * A small icon button opening a native menu with the options and a
 * checkmark on the current one (e.g. sorting, the result period).
 */
export function IconMenuPicker<T extends string>({
  icon,
  title,
  value,
  options,
  labels,
  onChange,
}: {
  /** SF Symbol of the button. */
  icon: string;
  /** Heading of the menu, also the spoken name of the button. */
  title: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Host matchContents>
      <Menu
        label={title}
        systemImage={icon}
        modifiers={[labelStyle('iconOnly'), buttonStyle('borderless'), controlSize('large')]}>
        <Section title={title}>
          <Picker<T>
            selection={value}
            onSelectionChange={onChange}
            modifiers={[pickerStyle('inline')]}>
            {options.map((option) => (
              <Text key={option} modifiers={[tag(option)]}>
                {labels[option]}
              </Text>
            ))}
          </Picker>
        </Section>
      </Menu>
    </Host>
  );
}
