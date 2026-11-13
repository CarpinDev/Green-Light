import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Text } from '@/components/text';
import { colors, space, type } from '@/theme/tokens';

/**
 * Un ícono de persona en el encabezado de las pestañas. Al tocarlo dice con qué cuenta estás y ofrece cerrar sesión.
 * Está en el encabezado y no en una pantalla porque se ve en las cuatro pestañas y siempre queda a un toque; y pide
 * confirmar porque cerrar sesión borra los datos del teléfono hasta volver a entrar.
 */
export function AccountButton() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (user === null) return null;

  const leave = async () => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      // Al salir, el guard cambia de pantallas y este botón se desmonta; si algo falló, el diálogo se cierra igual
      setLeaving(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cuenta de ${user.email}. Cerrar sesión`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.button}
      >
        <Feather name="user" size={22} color={colors.textMuted} />
      </Pressable>

      <ConfirmDialog
        visible={open}
        title="Cerrar sesión"
        confirmLabel="Cerrar sesión"
        confirmVariant="danger"
        loading={leaving}
        onConfirm={() => void leave()}
        onCancel={() => setOpen(false)}
      >
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.note}>Para volver a ver tus datos tendrás que iniciar sesión otra vez.</Text>
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  // 44 px: el mínimo cómodo para tocar
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: space.sm },
  name: { ...type.bodyMedium },
  email: { ...type.body, color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
});
