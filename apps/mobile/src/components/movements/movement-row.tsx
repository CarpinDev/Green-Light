import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { Movement } from '@/api/types';
import { Text } from '@/components/text';
import { formatDayShort } from '@/dates';
import { movementLabel, movementTags, signedAmount, sourceText } from '@/movements/logic';
import { colors, light, radius, space, type } from '@/theme/tokens';

/**
 * Una fila de movimiento ya ocurrido. Entrada: ícono y monto en verde. Salida: en el color normal del
 * texto, sin rojo (gastar no es un error). `showDate` pone la fecha en la segunda línea; en una lista
 * agrupada por día sobra, porque el título del grupo ya la dice.
 */
export function MovementRow({ movement, showDate = true }: { movement: Movement; showDate?: boolean }) {
  const income = movement.direction === 'in';
  const tags = movementTags(movement);
  const detail = [showDate && formatDayShort(movement.date), sourceText(movement)].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Feather
          name={income ? 'arrow-down-left' : 'arrow-up-right'}
          size={20}
          color={income ? light.green.bg : colors.text}
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {movementLabel(movement)}
        </Text>
        <Text style={styles.caption} numberOfLines={2}>
          {detail}
        </Text>
        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        )}
      </View>
      <Text style={[styles.amount, income && styles.income]}>{signedAmount(movement)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  name: { ...type.bodyMedium },
  caption: { ...type.caption, color: colors.textMuted },
  tags: { flexDirection: 'row', gap: space.xs, marginTop: 2 },
  tag: {
    ...type.captionSmall,
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
  },
  amount: { ...type.subtitle, fontSize: 16 },
  income: { color: light.green.bg },
});
