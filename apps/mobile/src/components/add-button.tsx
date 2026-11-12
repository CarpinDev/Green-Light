import { Feather } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from '@/navigation';
import { colors, radius, space, type } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Feather>['name'];

const OPTIONS: { label: string; detail: string; icon: IconName; href: Href }[] = [
  { label: 'Gasto', detail: 'Algo que pagaste', icon: 'arrow-up-right', href: '/expenses/new' },
  { label: 'Ingreso', detail: 'Plata que te entró', icon: 'arrow-down-left', href: '/incomes/new' },
];

/**
 * El "+" del centro de la barra. No es una pestaña: no tiene pantalla propia, abre un menú con dos
 * opciones (gasto o ingreso). Se usa como `tabBarButton`, así que ignora las props de pestaña.
 *
 * El menú es un `Modal` de React Native y no una ruta: se cierra solo, con el botón atrás de Android
 * (`onRequestClose`) y sin tocar el historial de navegación. A cambio no tiene URL propia, y no hace
 * falta: lo que importa es la pantalla a la que lleva cada opción.
 */
export function AddButton() {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar movimiento"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={styles.button}
      >
        <Feather name="plus" size={28} color={colors.onPrimary} />
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tocar fuera del menú lo cierra */}
        <Pressable
          accessibilityLabel="Cerrar menú"
          onPress={() => setOpen(false)}
          style={[styles.backdrop, { paddingBottom: bottom + TAB_BAR_HEIGHT + TAB_BAR_MARGIN * 2 }]}
        >
          {/* Un Pressable interno que no hace nada: los toques dentro del menú no llegan al fondo */}
          <Pressable accessible={false} style={styles.menu}>
            {OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                accessibilityLabel={`Registrar ${option.label.toLowerCase()}`}
                onPress={() => go(option.href)}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <View style={styles.iconWrap}>
                  <Feather name={option.icon} size={22} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDetail}>{option.detail}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: space.lg,
  },
  menu: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.sm,
    gap: space.xs,
  },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: type.subtitle,
  optionDetail: { ...type.caption, color: colors.textMuted },
});
