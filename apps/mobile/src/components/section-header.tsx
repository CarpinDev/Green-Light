import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, type } from '@/theme/tokens';

/** El encabezado de una sección de pestaña: el título y, a la derecha, "+ Agregar" que abre un formulario. */
export function SectionHeader({ title, addHref }: { title: string; addHref?: Href }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      {addHref !== undefined && (
        <Link href={addHref} asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text style={styles.add}>+ Agregar</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: type.title,
  add: { color: colors.primary, fontWeight: '700' },
});
