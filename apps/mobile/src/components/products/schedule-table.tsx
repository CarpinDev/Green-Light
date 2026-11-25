import { StyleSheet, View } from 'react-native';

import type { LoanScheduleRow } from '@/api/types';
import { Card } from '@/components/card';
import { ConfirmButton, UndoButton } from '@/components/payments/confirm-button';
import { Text } from '@/components/text';
import { formatDayShort } from '@/dates';
import { formatCop } from '@/money';
import { paidSummary } from '@/payments/logic';
import { colors, space, type } from '@/theme/tokens';

/**
 * La tabla de amortización: una fila por cuota con su fecha, el total, capital, interés, seguro y el saldo que
 * queda. Las pagadas van atenuadas y la próxima resaltada.
 */
export function ScheduleTable({ loanId, rows }: { loanId: number; rows: readonly LoanScheduleRow[] }) {
  const next = rows.find((r) => !r.paid && r.payment > 0);

  return (
    <Card style={styles.card}>
      {rows.map((row) => {
        const isNext = row === next;
        return (
          <View
            key={row.period}
            style={[styles.row, isNext && styles.next]}
            accessibilityLabel={`Cuota ${row.period}, ${formatDayShort(row.dueDate)}: ${formatCop(row.total)}${
              row.paid ? ', pagada' : ''
            }`}
          >
            <View style={styles.top}>
              <Text style={[styles.date, row.paid && styles.dim, isNext && styles.nextText]}>
                {row.period}. {formatDayShort(row.dueDate)}
                {isNext && ' · próxima'}
              </Text>
              <Text style={[styles.total, row.paid && styles.dim, isNext && styles.nextText]}>
                {formatCop(row.total)}
              </Text>
            </View>
            <Text style={[styles.detail, row.paid && styles.dim]}>
              capital {formatCop(row.principal)} · interés {formatCop(row.interest)}
              {row.insurance > 0 && ` · seguro ${formatCop(row.insurance)}`}
            </Text>
            <Text style={[styles.detail, row.paid && styles.dim]}>
              {row.prepayment > 0 && `abono ${formatCop(row.prepayment)} · `}saldo {formatCop(row.closingBalance)}
            </Text>
            {row.confirmed != null && (
              <>
                <Text style={styles.confirmed}>{paidSummary(row.confirmed)}</Text>
                <UndoButton path={`/debt-payments/${row.confirmed.id}`} />
              </>
            )}
            {/* La próxima cuota, que se puede pagar antes de su fecha */}
            {isNext && row.confirmed == null && (
              <ConfirmButton
                target={{
                  kind: 'loan',
                  id: loanId,
                  scheduledDate: row.dueDate,
                  name: `Cuota ${row.period}`,
                  expectedCents: row.total,
                }}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs },
  row: { gap: 2, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  next: { backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  date: type.bodyMedium,
  total: type.bodyMedium,
  detail: { ...type.caption, color: colors.textMuted },
  confirmed: { ...type.caption, color: colors.primary },
  dim: { opacity: 0.45 },
  nextText: { color: colors.primary },
});
