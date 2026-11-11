import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import { errorText, isStaleBalance } from '@/api/errors';
import type { MonthSummary, ProjectionResponse } from '@/api/types';
import { Text } from '@/components/text';
import { currentMonth, formatDay, formatMonth, STALE_DAYS } from '@/dates';
import { formatCop } from '@/money';
import { colors, fonts, light, radius, type } from '@/theme/tokens';

export default function Home() {
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });

  if (projection.isPending)
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );

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
        <RefreshControl
          refreshing={projection.isRefetching}
          onRefresh={() => void projection.refetch()}
          tintColor={colors.primary}
        />
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
    <View style={[styles.card, { borderLeftColor: light[month.light].bg }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.month}>{formatMonth(month.month)}</Text>
        <View style={[styles.badge, { backgroundColor: light[month.light].bg }]}>
          <Text style={[styles.badgeText, { color: light[month.light].fg }]}>{light[month.light].label}</Text>
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
  asOf: { ...type.bodyMedium },
  muted: { ...type.caption, color: colors.textMuted },
  errorTitle: { ...type.subtitle },
  button: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
  warning: { backgroundColor: light.yellow.bg, borderRadius: radius.sm, padding: 12, gap: 6 },
  warningText: { color: light.yellow.fg },
  // El Link de expo-router usa su propio Text: la fuente va explícita
  warningLink: { color: light.yellow.fg, fontFamily: fonts.bodyBold, textDecorationLine: 'underline' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderLeftWidth: 6,
    padding: 16,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { ...type.subtitle, textTransform: 'capitalize' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  label: { ...type.captionSmall, color: colors.textMuted, marginTop: 8 },
  closing: { ...type.title },
});
