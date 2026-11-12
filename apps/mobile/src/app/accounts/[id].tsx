import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { AccountSummary } from '@/api/types';
import { Card } from '@/components/card';
import { DangerZone } from '@/components/products/danger-zone';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatCop } from '@/money';
import { colors, space, type } from '@/theme/tokens';

/** Una cuenta y, al final, su zona de peligro (archivar o eliminar). La cuenta sale del listado de Productos. */
export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });

  return (
    <QueryState query={accounts} errorTitle="No se pudo cargar la cuenta.">
      {(data) => {
        const account = data.find((a) => String(a.id) === id);
        if (account === undefined) {
          return (
            <View style={styles.missing}>
              <Text style={styles.muted}>Esta cuenta ya no existe.</Text>
            </View>
          );
        }
        return (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.header}>
              <Text style={type.title}>
                {account.name} <Text style={styles.muted}>····{account.last4}</Text>
              </Text>
              <Text style={styles.muted}>{account.bank}</Text>
              <Text style={styles.muted}>
                {account.latestBalance === null
                  ? 'Sin saldo todavía'
                  : `Último saldo: ${formatCop(account.latestBalance.balanceCents)}`}
              </Text>
            </Card>
            <DangerZone
              productId={account.id}
              kind="account"
              balanceCents={account.latestBalance?.balanceCents ?? null}
            />
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { gap: space.xs },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  muted: { ...type.caption, color: colors.textMuted },
});
