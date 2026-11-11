import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getJson } from '@/api/client';
import { errorText, isStaleBalance } from '@/api/errors';
import type { MonthSummary, ProjectionResponse } from '@/api/types';
import { currentMonth, formatDay, formatMonth, STALE_DAYS } from '@/dates';
import { LIGHT_COLOR, LIGHT_LABEL } from '@/light';
import { formatCop } from '@/money';

export default function Home() {
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });

  if (projection.isPending) return <Centered><ActivityIndicator size="large" /></Centered>;

  if (projection.isError) {
    return (
      <Centered>
        <Text style={styles.errorTitle}>{titleOf(projection.error)}</Text>
        <Text style={styles.muted}>{errorText(projection.error)}</Text>
        {isStaleBalance(projection.error) ? (
          // Reintentar no sirve: el saldo sigue viejo hasta que lo confirmes
          <Link href="/balances" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Confirmar saldo</Text>
            </Pressable>
          </Link>
        ) : (
          <Pressable onPress={() => void projection.refetch()} style={styles.button}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        )}
      </Centered>
    );
  }

  const { asOf, daysSinceBalance, staleAccounts, months } = projection.data;
  // El primer mes proyectado puede ya haber pasado: se muestra solo desde el mes actual
  const now = currentMonth();
  const visible = months.filter((m) => m.month >= now);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={projection.isRefetching} onRefresh={() => void projection.refetch()} />
      }
    >
      <Text style={styles.asOf}>Saldo al {formatDay(asOf)}</Text>

      <Link href="/expenses/new" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Registrar gasto</Text>
        </Pressable>
      </Link>

      <Link href="/simulate" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>¿Puedo comprar esto?</Text>
        </Pressable>
      </Link>

      <Link href="/balances" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Confirmar saldos</Text>
        </Pressable>
      </Link>

      {daysSinceBalance > STALE_DAYS && (
        <Warning>Tu último saldo tiene {daysSinceBalance} días: confírmalo para que la proyección sea fiable.</Warning>
      )}
      {staleAccounts.length > 0 && (
        <Warning>
          {staleAccounts.length === 1
            ? 'Una cuenta tiene un saldo más viejo que el resto.'
            : `${staleAccounts.length} cuentas tienen un saldo más viejo que el resto.`}{' '}
          Actualízalas.
        </Warning>
      )}

      {visible.length === 0 ? (
        <Text style={styles.muted}>No hay meses proyectados desde el mes actual.</Text>
      ) : (
        visible.map((month) => <MonthCard key={month.month} month={month} />)
      )}
    </ScrollView>
  );
}

function MonthCard({ month }: { month: MonthSummary }) {
  return (
    <View style={[styles.card, { borderLeftColor: LIGHT_COLOR[month.light] }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.month}>{formatMonth(month.month)}</Text>
        <View style={[styles.badge, { backgroundColor: LIGHT_COLOR[month.light] }]}>
          <Text style={styles.badgeText}>{LIGHT_LABEL[month.light]}</Text>
        </View>
      </View>
      <Text style={styles.label}>Cierra con</Text>
      <Text style={styles.closing}>{formatCop(month.closingBalance)}</Text>
      {month.lowestBalanceDate !== undefined && (
        <Text style={styles.muted}>
          Lo más bajo: {formatCop(month.lowestBalance)} el {formatDay(month.lowestBalanceDate)}
        </Text>
      )}
    </View>
  );
}

/** Un aviso que lleva directo a confirmar los saldos. */
function Warning({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{children}</Text>
      <Link href="/balances" style={styles.warningLink}>
        Confirmar saldo
      </Link>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

/** Un 409 no es un error genérico: es el saldo viejo, y la solución es confirmarlo. */
function titleOf(error: Error): string {
  return isStaleBalance(error) ? 'Falta un saldo reciente' : 'No se pudo cargar la proyección';
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  asOf: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666', fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  button: { backgroundColor: '#1f6feb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  warning: { backgroundColor: '#fff4d6', borderRadius: 8, padding: 12, gap: 6 },
  warningText: { color: '#7a5a00' },
  warningLink: { color: '#1f6feb', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 6, padding: 16, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 18, fontWeight: '700', textTransform: 'capitalize' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  label: { color: '#666', fontSize: 12, marginTop: 8 },
  closing: { fontSize: 24, fontWeight: '700' },
});
