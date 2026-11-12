import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { FixedExpense, RecurringIncome } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatDay } from '@/dates';
import { editHref, MONTHLY, type MonthlyKind, newHref, placeOf } from '@/monthly/kinds';
import { activeTotal, splitByStatus } from '@/monthly/logic';
import { formatCop } from '@/money';
import { colors, space, type } from '@/theme/tokens';

interface MonthlySectionProps {
  kind: MonthlyKind;
  items: readonly (RecurringIncome | FixedExpense)[];
}

/** Una sección de la pestaña Mensual: vigentes con su total, y aparte los terminados, atenuados. */
export function MonthlySection({ kind, items }: MonthlySectionProps) {
  const text = MONTHLY[kind];
  const { upcoming, active, ended } = splitByStatus(items);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{text.section}</Text>
        {items.length > 0 && (
          <Link href={newHref(kind)} asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text style={styles.add}>+ Agregar</Text>
            </Pressable>
          </Link>
        )}
      </View>

      {items.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
          <Text style={styles.muted}>{text.emptyText}</Text>
          <Link href={newHref(kind)} asChild>
            <Button label={text.addLabel} />
          </Link>
        </Card>
      ) : (
        <>
          {active.length > 0 ? (
            <Card style={styles.list}>
              {active.map((item) => (
                <Row key={item.id} kind={kind} item={item} />
              ))}
              <View style={styles.total}>
                <Text style={styles.muted}>Total mensual</Text>
                <Text style={styles.totalAmount}>{formatCop(activeTotal(active))}</Text>
              </View>
            </Card>
          ) : (
            <Text style={styles.muted}>No hay {text.section.toLowerCase()} vigentes.</Text>
          )}

          {upcoming.length > 0 && (
            <View style={styles.ended}>
              <Text style={styles.endedTitle}>Próximos</Text>
              <Card style={styles.list}>
                {upcoming.map((item) => (
                  <Row key={item.id} kind={kind} item={item} />
                ))}
              </Card>
            </View>
          )}

          {ended.length > 0 && (
            <View style={styles.ended}>
              <Text style={styles.endedTitle}>Terminados</Text>
              <Card style={[styles.list, styles.dim]}>
                {ended.map((item) => (
                  <Row key={item.id} kind={kind} item={item} />
                ))}
              </Card>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Row({ kind, item }: { kind: MonthlyKind; item: RecurringIncome | FixedExpense }) {
  // Lo que dice la fila además del día y el lugar: cuándo empieza o cuándo termina
  const note =
    item.status === 'upcoming'
      ? `empieza el ${formatDay(item.startDate)}`
      : item.endDate === null
        ? null
        : item.status === 'active'
          ? `termina el ${formatDay(item.endDate)}`
          : `terminó el ${formatDay(item.endDate)}`;

  return (
    <Link href={editHref(kind, item.id)} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`} style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            día {item.dayOfMonth} · {placeOf(kind, item)}
            {note !== null && ` · ${note}`}
          </Text>
        </View>
        <Text style={styles.amount}>{formatCop(item.amountCents)}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: type.title,
  add: { color: colors.primary, fontWeight: '700' },
  empty: { gap: space.md },
  emptyTitle: type.subtitle,
  list: { paddingVertical: space.xs },
  dim: { opacity: 0.55 },
  ended: { gap: space.sm },
  endedTitle: { ...type.caption, color: colors.textMuted },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  name: { ...type.bodyMedium },
  amount: { ...type.bodyMedium },
  muted: { ...type.caption, color: colors.textMuted },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: space.md,
  },
  totalAmount: { ...type.subtitle },
});
