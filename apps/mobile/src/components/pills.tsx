import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts, radius, space } from '@/theme/tokens';

interface PillsProps<T extends string | number> {
  items: readonly { value: T; label: string }[];
  /** null: ninguna elegida. */
  selected: T | null;
  onSelect: (value: T) => void;
}

/** Opciones en pastilla, en una fila que baja de línea si no caben: para elegir una (fecha, categoría). */
export function Pills<T extends string | number>({ items, selected, onSelect }: PillsProps<T>) {
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
            style={[styles.pill, active && styles.active]}
          >
            <Text style={active ? styles.activeText : styles.text}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
  },
  active: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  text: { color: colors.text },
  activeText: { color: colors.text, fontFamily: fonts.bodyBold },
});
