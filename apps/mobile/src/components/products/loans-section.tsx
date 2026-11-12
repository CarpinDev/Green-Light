import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LoanSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatCop } from '@/money';
import { loanRowText } from '@/products/loan';
import { colors, space, type } from '@/theme/tokens';

/** Los préstamos: una fila por préstamo (saldo, próxima cuota y cuántas quedan) que abre su detalle. */
export function LoansSection({ loans }: { loans: readonly LoanSummary[] }) {
  if (loans.length === 0) {
    return (
      <Card style={styles.empty}>
        <Text style={type.subtitle}>Agrega tu primer préstamo</Text>
        <Text style={styles.muted}>
          Con tu préstamo la app cuenta cada cuota en tu proyección y te muestra cuánto falta para terminarlo.
        </Text>
        <Link href="/loans/new" asChild>
          <Button label="Agregar préstamo" />
        </Link>
      </Card>
    );
  }

  return (
    <Card style={styles.list}>
      {loans.map((loan) => {
        const { installment, remaining } = loanRowText(loan);
        return (
          <Link key={loan.id} href={{ pathname: '/loans/[id]', params: { id: String(loan.id) } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${loan.name}`} style={styles.row}>
              <View style={styles.main}>
                <Text style={styles.name} numberOfLines={1}>
                  {loan.name} <Text style={styles.muted}>{loan.bank}</Text>
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {installment}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {remaining}
                </Text>
              </View>
              <View style={styles.balance}>
                <Text style={styles.amount}>{formatCop(loan.balanceCents)}</Text>
                <Text style={styles.small}>saldo</Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { gap: space.md },
  list: { paddingVertical: space.xs },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
  },
  main: { flex: 1, gap: 2 },
  name: type.bodyMedium,
  balance: { alignItems: 'flex-end', gap: 2 },
  amount: { ...type.bodyMedium, color: colors.primary },
  small: { ...type.captionSmall, color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted },
});
