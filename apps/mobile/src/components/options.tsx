import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    borderColor: '#ccc',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  optionSelected: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  optionText: { color: '#222' },
  optionTextSelected: { color: '#fff', fontWeight: '600' },
});
