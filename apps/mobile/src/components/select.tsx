import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius, space } from '@/theme/tokens';

interface SelectProps {
  items: readonly { id: number; label: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  /** Lo que se muestra mientras no hay nada elegido. */
  placeholder: string;
}

/** Un selector desplegable: muestra la opción elegida y, al tocarlo, la lista debajo (sin modal). */
export function Select({ items, selected, onSelect, placeholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = items.find((item) => item.id === selected);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="combobox"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.field}
      >
        <Text style={current ? styles.value : styles.placeholder} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: item.id === selected }}
              onPress={() => {
                onSelect(item.id);
                setOpen(false);
              }}
              style={styles.option}
            >
              <Text style={item.id === selected ? styles.optionActive : styles.value}>{item.label}</Text>
              {item.id === selected && <Feather name="check" size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, flexShrink: 1 },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
  },
  value: { color: colors.text, flexShrink: 1 },
  placeholder: { color: colors.textMuted, flexShrink: 1 },
  list: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  optionActive: { color: colors.primary, fontWeight: '700' },
});
