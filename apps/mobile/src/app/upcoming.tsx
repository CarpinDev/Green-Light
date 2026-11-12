import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { ProjectionResponse } from '@/api/types';
import { EventRow } from '@/components/movements/event-row';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { currentMonth, today } from '@/dates';
import { upcomingEvents } from '@/home/summary';
import { groupByDay } from '@/movements/logic';
import { colors, space, type } from '@/theme/tokens';

/** Lo que viene en el mes actual y el siguiente, agrupado por día, sacado de la proyección. */
export default function Upcoming() {
  // La misma consulta que usa Inicio: comparte caché y no vuelve a pedir lo que ya llegó
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });

  return (
    <QueryState query={projection} errorTitle="No se pudo cargar la proyección">
      {({ months }) => {
        const events = upcomingEvents(months, currentMonth(), today());
        return (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.note}>
              Una compra con tarjeta no aparece el día de la compra: aparece como &quot;Pago de tarjeta&quot; el día en
              que vence el pago del extracto.
            </Text>

            {events.length === 0 ? (
              <Text style={styles.muted}>No hay movimientos próximos en este mes ni en el siguiente.</Text>
            ) : (
              groupByDay(events, today()).map((group) => (
                <View key={group.date} style={styles.group}>
                  <Text style={styles.day}>{group.title}</Text>
                  {group.items.map((event, i) => (
                    <EventRow key={`${event.date}-${event.refId ?? ''}-${i}`} event={event} showDate={false} />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  note: { ...type.caption, color: colors.textMuted },
  group: { gap: space.md },
  day: { ...type.caption, color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted },
});
