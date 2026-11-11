import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, getJson } from '@/api/client';
import type { Light, MonthSummary, ProjectionResponse } from '@/api/types';
import { currentMonth, formatDay, formatMonth } from '@/dates';
import { formatCop } from '@/money';

/** Más de esta cantidad de días desde el último saldo, la proyección merece un aviso. */
const STALE_DAYS = 7;

const LIGHT_COLOR: Record<Light, string> = { green: '#2e9e5b', yellow: '#e0a800', red: '#d64545' };
const LIGHT_LABEL: Record<Light, string> = { green: 'Verde', yellow: 'Amarillo', red: 'Rojo' };

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
        <Text style={styles.muted}>{detailOf(projection.error)}</Text>
        <Pressable onPress={() => void projection.refetch()} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
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

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{children}</Text>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

/** Un 409 no es un error genérico: es el saldo viejo, y la solución es confirmarlo. */
function titleOf(error: Error): string {
  return error instanceof ApiError && error.status === 409 ? 'Falta un saldo reciente' : 'No se pudo cargar la proyección';
}

function detailOf(error: Error): string {
  if (error instanceof ApiError && error.status === 409) {
    // El mensaje de la API trae la fecha: "Tu último saldo es del 2026-10-02, confírmalo para proyectar"
    const date = /\d{4}-\d{2}-\d{2}/.exec(error.message)?.[0];
    return date ? `Tu saldo es del ${formatDay(date)}, confírmalo.` : error.message;
  }
  return error instanceof ApiError ? error.message : 'No hay conexión con la API. ¿Está corriendo?';
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  asOf: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666', fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  button: { backgroundColor: '#1f6feb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  warning: { backgroundColor: '#fff4d6', borderRadius: 8, padding: 12 },
  warningText: { color: '#7a5a00' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 6, padding: 16, gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 18, fontWeight: '700', textTransform: 'capitalize' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  label: { color: '#666', fontSize: 12, marginTop: 8 },
  closing: { fontSize: 24, fontWeight: '700' },
});
