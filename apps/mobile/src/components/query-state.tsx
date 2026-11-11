import type { UseQueryResult } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorText } from '@/api/errors';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { colors, space, type } from '@/theme/tokens';

interface QueryStateProps<T> {
  query: UseQueryResult<T, Error>;
  /** Lo que se muestra cuando hay datos. */
  children: (data: T) => React.ReactNode;
  /** El texto de "no hay nada". Sin él, una lista vacía se muestra tal cual (con sus datos). */
  emptyText?: string;
  /** Cuándo los datos cuentan como vacíos. Por defecto: una lista sin elementos. */
  isEmpty?: (data: T) => boolean;
  /** El título del error; puede depender del error. */
  errorTitle: string | ((error: Error) => string);
  /** La acción del error; por defecto "Reintentar". Un saldo viejo, p. ej., pide confirmarlo, no reintentar. */
  errorAction?: (error: Error, retry: () => void) => React.ReactNode;
  /** Dentro de un formulario (una línea) en vez de ocupar toda la pantalla. */
  inline?: boolean;
}

/** Carga, error con acción y vacío de una consulta: las pantallas solo escriben lo que hacen con los datos. */
export function QueryState<T>({
  query,
  children,
  emptyText,
  isEmpty = (data) => Array.isArray(data) && data.length === 0,
  errorTitle,
  errorAction,
  inline = false,
}: QueryStateProps<T>) {
  const box = inline ? styles.inline : styles.screen;

  if (query.isPending) {
    return (
      <View style={box}>
        <ActivityIndicator size={inline ? 'small' : 'large'} color={colors.primary} />
      </View>
    );
  }

  const retry = () => void query.refetch();

  // Falló y no hay nada que mostrar: el error ocupa el lugar de los datos
  if (query.isError && query.data === undefined) {
    return (
      <View style={box}>
        <Text style={inline ? styles.inlineError : styles.errorTitle}>
          {typeof errorTitle === 'function' ? errorTitle(query.error) : errorTitle}
        </Text>
        {!inline && <Text style={styles.detail}>{errorText(query.error)}</Text>}
        {errorAction ? errorAction(query.error, retry) : <Button label="Reintentar" onPress={retry} />}
      </View>
    );
  }

  // Desde aquí hay datos (puede que viejos: falló un refetch y se conserva lo último que llegó)
  if (query.data === undefined) return null;

  if (emptyText !== undefined && isEmpty(query.data)) {
    return (
      <View style={box}>
        <Text style={styles.detail}>{emptyText}</Text>
      </View>
    );
  }

  // Un refetch fallido no tira los datos: se muestran, con el error y "Reintentar" arriba
  if (query.isError) {
    return (
      <View style={inline ? undefined : styles.fill}>
        <View style={inline ? undefined : styles.banner}>
          <Banner action={{ label: 'Reintentar', onPress: retry }}>
            No se pudo actualizar: {errorText(query.error)} Lo que ves puede estar desactualizado.
          </Banner>
        </View>
        {children(query.data)}
      </View>
    );
  }

  return <>{children(query.data)}</>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  inline: { gap: space.sm, alignItems: 'flex-start' },
  fill: { flex: 1 },
  banner: { padding: space.lg, paddingBottom: 0, maxWidth: 640, width: '100%', alignSelf: 'center' },
  errorTitle: { ...type.subtitle, textAlign: 'center' },
  inlineError: { color: colors.danger },
  detail: { ...type.caption, color: colors.textMuted },
});
