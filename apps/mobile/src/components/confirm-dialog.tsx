import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { colors, radius, space, type } from '@/theme/tokens';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  /** Lo que se explica: párrafos o líneas de lista. */
  children?: React.ReactNode;
  confirmLabel: string;
  /** `danger` para lo que no se puede deshacer. */
  confirmVariant?: 'primary' | 'danger';
  /** Sin confirmar (p. ej. hay bloqueos): solo queda "Cerrar". */
  hideConfirm?: boolean;
  /** Deshabilita los botones y muestra el spinner mientras la acción corre. */
  loading?: boolean;
  /** Un error de la acción (p. ej. el 409 de la API), dentro del diálogo. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Un diálogo de confirmación con `Modal`. `Alert.alert` con botones no funciona en web, y este se ve igual en
 * todas las plataformas. Tocar fuera o el botón atrás de Android lo cancelan.
 */
export function ConfirmDialog({
  visible,
  title,
  children,
  confirmLabel,
  confirmVariant = 'primary',
  hideConfirm = false,
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Cerrar" onPress={loading ? undefined : onCancel} style={styles.backdrop}>
        {/* Un Pressable interno que no hace nada: los toques dentro del diálogo no llegan al fondo */}
        <Pressable accessible={false} style={styles.dialog}>
          <Text accessibilityRole="header" style={type.subtitle}>
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            {!hideConfirm && (
              <Button label={confirmLabel} variant={confirmVariant} loading={loading} onPress={onConfirm} />
            )}
            <Button
              label={hideConfirm ? 'Cerrar' : 'Cancelar'}
              variant="secondary"
              disabled={loading}
              onPress={onCancel}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: space.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.xl,
  },
  body: { gap: space.sm },
  error: { color: colors.danger },
  actions: { gap: space.sm },
});
