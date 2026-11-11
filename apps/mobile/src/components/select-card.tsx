import { Pressable, StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { colors, fonts, space } from '@/theme/tokens';

/** Una opción grande para elegir una (de dónde sale el gasto): nombre y detalle; la elegida lleva borde primary. */
export function SelectCard({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.slot}>
      <Card style={[styles.card, selected && styles.selected]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.detail, selected && styles.detailSelected]}>{detail}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Dos por fila: cada una ocupa casi la mitad y baja de línea si hay más
  slot: { flexBasis: '47%', flexGrow: 1 },
  card: { gap: 2, paddingVertical: space.md, borderWidth: 2 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  detail: { color: colors.textMuted, fontSize: 14 },
  detailSelected: { color: colors.primary },
});
