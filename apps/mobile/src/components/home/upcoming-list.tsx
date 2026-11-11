import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { CashEvent, CashEventKind } from '@/api/types';
import { Text } from '@/components/text';
import { formatDayShort } from '@/dates';
import { KIND_LABEL } from '@/home/summary';
import { formatCop } from '@/money';
import { colors, light, radius, space, type } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Feather>['name'];

const ICON: Record<CashEventKind, IconName> = {
  fixed_expense: 'home',
  card_payment: 'credit-card',
  income: 'arrow-up',
  expense: 'shopping-bag',
  loan_payment: 'dollar-sign',
  capital_payment: 'dollar-sign',
};

/** Los próximos movimientos: ícono, nombre, "tipo · fecha" y monto (con signo; los ingresos en verde). */
export function UpcomingList({ events }: { events: readonly CashEvent[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Próximos pagos</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No hay pagos próximos.</Text>
      ) : (
        events.map((event, i) => <Row key={`${event.date}-${event.refId ?? ''}-${i}`} event={event} />)
      )}
    </View>
  );
}

function Row({ event }: { event: CashEvent }) {
  const income = event.amount > 0;
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Feather name={ICON[event.kind]} size={20} color={income ? light.green.bg : colors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {event.label}
        </Text>
        <Text style={styles.caption}>
          {KIND_LABEL[event.kind]} · {formatDayShort(event.date)}
        </Text>
      </View>
      <Text style={[styles.amount, income && styles.income]}>
        {income ? '+' : '−'}
        {formatCop(Math.abs(event.amount))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  heading: { ...type.subtitle },
  empty: { ...type.caption, color: colors.textMuted },
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
  amount: { ...type.subtitle, fontSize: 16 },
  income: { color: light.green.bg },
});
