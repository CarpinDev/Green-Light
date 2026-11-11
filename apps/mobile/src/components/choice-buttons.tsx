import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts, radius, space } from '@/theme/tokens';

interface ChoiceButtonsProps<T extends string | number> {
  items: readonly { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
}

/** Botones del mismo ancho en una fila, uno por opción (cuotas: 1, 3, 6, 12, Otra). La elegida va en primary. */
export function ChoiceButtons<T extends string | number>({ items, selected, onSelect }: ChoiceButtonsProps<T>) {
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const active = item.value === selected;
        return (
          <Pressable
            key={String(item.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.value)}
            style={[styles.button, active && styles.active]}
          >
            <Text style={active ? styles.activeText : styles.text}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text },
  activeText: { color: colors.onPrimary, fontFamily: fonts.bodyBold },
});
