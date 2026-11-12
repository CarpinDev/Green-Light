import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { ProjectionResponse } from '@/api/types';
import { EventRow } from '@/components/movements/event-row';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { currentMonth, formatMonthName, today } from '@/dates';
import { type MonthEvents, upcomingByMonth } from '@/home/summary';
import { formatCop } from '@/money';
import { groupByDay } from '@/movements/logic';
import { colors, light, space, type } from '@/theme/tokens';

/**
 * Lo que viene en todos los meses de la proyección, agrupado por mes en un acordeón: el mes actual abierto y los
 * siguientes plegados. Dentro de cada mes, por día.
 */
export default function Upcoming() {
  // La misma consulta que usa Inicio: comparte caché y no vuelve a pedir lo que ya llegó
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });
  // Qué meses el usuario abrió o cerró a mano; el resto sigue la regla (solo el actual abierto). Solo en memoria
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <QueryState query={projection} errorTitle="No se pudo cargar la proyección">
      {({ months }) => {
        const groups = upcomingByMonth(months, currentMonth(), today());
        return (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.note}>
              Una compra con tarjeta no aparece el día de la compra: aparece como &quot;Pago de tarjeta&quot; el día en
              que vence el pago del extracto.
            </Text>

            {groups.map((group) => {
              const expanded = toggled[group.month] ?? group.month === currentMonth();
              return (
                <MonthSection
                  key={group.month}
                  group={group}
                  expanded={expanded}
                  onToggle={() => setToggled((prev) => ({ ...prev, [group.month]: !expanded }))}
                />
              );
            })}
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

function MonthSection({ group, expanded, onToggle }: { group: MonthEvents; expanded: boolean; onToggle: () => void }) {
  const name = formatMonthName(group.month);
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <View style={styles.month}>
      {/* El encabezado es el botón que abre y cierra el mes */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}: entra ${formatCop(group.income)}, sale ${formatCop(group.outflow)}`}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={type.subtitle}>{title}</Text>
          <Text style={styles.totals}>
            <Text style={styles.in}>+{formatCop(group.income)}</Text> ·{' '}
            <Text style={styles.out}>−{formatCop(group.outflow)}</Text>
          </Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
      </Pressable>

      {expanded &&
        (group.events.length === 0 ? (
          <Text style={styles.muted}>No hay movimientos próximos en este mes.</Text>
        ) : (
          groupByDay(group.events, today()).map((day) => (
            <View key={day.date} style={styles.group}>
              <Text style={styles.day}>{day.title}</Text>
              {day.items.map((event, i) => (
                <EventRow key={`${event.date}-${event.refId ?? ''}-${i}`} event={event} showDate={false} />
              ))}
            </View>
          ))
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  note: { ...type.caption, color: colors.textMuted },
  month: { gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 48 },
  headerText: { flex: 1, gap: 2 },
  totals: { ...type.caption, color: colors.textMuted },
  in: { color: light.green.bg },
  out: { color: colors.danger },
  group: { gap: space.md },
  day: { ...type.caption, color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted },
});
