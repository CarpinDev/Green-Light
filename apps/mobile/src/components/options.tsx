import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius } from '@/theme/tokens';

/** Una fila de opciones para elegir una: la elegida va resaltada. */
export function Options({
  items,
  selected,
  onSelect,
}: {
  items: { id: number; label: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <View style={styles.options}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onSelect(item.id)}
          style={[styles.option, item.id === selected && styles.optionSelected]}
        >
          <Text style={item.id === selected ? styles.optionTextSelected : styles.optionText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.text },
  optionTextSelected: { color: colors.onPrimary, fontWeight: '600' },
});
