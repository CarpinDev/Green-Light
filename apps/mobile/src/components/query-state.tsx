import type { UseQueryResult } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorText } from '@/api/errors';
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

  if (query.isError) {
    const retry = () => void query.refetch();
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

  if (emptyText !== undefined && isEmpty(query.data)) {
    return (
      <View style={box}>
        <Text style={styles.detail}>{emptyText}</Text>
      </View>
    );
  }

  return <>{children(query.data)}</>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  inline: { gap: space.sm, alignItems: 'flex-start' },
  errorTitle: { ...type.subtitle, textAlign: 'center' },
  inlineError: { color: colors.danger },
  detail: { ...type.caption, color: colors.textMuted },
});
