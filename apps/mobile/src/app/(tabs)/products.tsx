import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { AccountSummary, CardSummary, Product, ProjectionResponse } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { BalanceCard } from '@/components/products/balance-card';
import { CardsSection } from '@/components/products/cards-section';
import { QueryState } from '@/components/query-state';
import { SectionHeader } from '@/components/section-header';
import { Text } from '@/components/text';
import { useTabBarClearance } from '@/navigation';
import { colors, space, type } from '@/theme/tokens';

export default function Products() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });
  const cards = useQuery({ queryKey: ['cards'], queryFn: () => getJson<CardSummary[]>('/cards') });
  // Solo para el contador del enlace: se comparte la clave con la pantalla de archivados
  const archived = useQuery({
    queryKey: ['products', 'archived'],
    queryFn: () => getJson<Product[]>('/products?archived=true'),
  });
  const archivedCount = archived.data?.length ?? 0;
  // La misma consulta de Inicio (comparte caché). Si falla (p. ej. saldo viejo), simplemente no hay saldo estimado
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });
  const clearance = useTabBarClearance();

  // Cada sección con su propio estado: si una falla o carga, la otra no se queda esperando
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <SectionHeader title="Cuentas" addHref="/accounts/new" />
        <QueryState inline query={accounts} errorTitle="No se pudieron cargar tus cuentas.">
          {(data) =>
            data.length === 0 ? (
              <Card style={styles.empty}>
                <Text style={type.subtitle}>Agrega tu primera cuenta</Text>
                <Text style={styles.muted}>Con el saldo de tus cuentas la app proyecta cuánto te queda cada mes.</Text>
                <Link href="/accounts/new" asChild>
                  <Button label="Agregar cuenta" />
                </Link>
              </Card>
            ) : (
              <View style={styles.accounts}>
                {data.map((account) => (
                  <BalanceCard
                    key={account.id}
                    account={account}
                    // El saldo actual se calcula para el total de las cuentas: solo con una es el de esa cuenta
                    estimatedCents={data.length === 1 ? projection.data?.currentBalanceCents : undefined}
                  />
                ))}
              </View>
            )
          }
        </QueryState>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Tarjetas de crédito" addHref="/cards/new" />
        <QueryState inline query={cards} errorTitle="No se pudieron cargar tus tarjetas.">
          {(data) => <CardsSection cards={data} />}
        </QueryState>
      </View>

      {archivedCount > 0 && (
        <Link href="/archived" asChild>
          <Pressable accessibilityRole="link" style={styles.archived}>
            <Text style={styles.archivedText}>Archivados ({archivedCount})</Text>
          </Pressable>
        </Link>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: { gap: space.md },
  accounts: { gap: space.md },
  empty: { gap: space.md },
  muted: { ...type.caption, color: colors.textMuted },
  archived: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  archivedText: { color: colors.primary, fontWeight: '700' },
});
