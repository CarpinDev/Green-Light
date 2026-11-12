import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddButton } from '@/components/add-button';
import { TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from '@/navigation';
import { colors, fonts, radius } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** El ícono de una pestaña: primary si está activa, textMuted si no. */
function TabIcon({ name, focused, size }: { name: IconName; focused: boolean; size: number }) {
  return <Feather name={name} size={size} color={focused ? colors.primary : colors.textMuted} />;
}

const icon = (name: IconName) => {
  const render = (props: { focused: boolean; size: number }) => <TabIcon name={name} {...props} />;
  return render;
};

export default function TabsLayout() {
  const { bottom } = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.title },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
        // Flotante: encima del contenido, separada de los bordes y por encima de la zona segura
        tabBarStyle: {
          position: 'absolute',
          left: TAB_BAR_MARGIN,
          right: TAB_BAR_MARGIN,
          bottom: bottom + TAB_BAR_MARGIN,
          height: TAB_BAR_HEIGHT,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xl,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', headerTitle: 'GreenLight', tabBarIcon: icon('home') }} />
      <Tabs.Screen
        name="simulate"
        options={{ title: 'Simular', headerTitle: '¿Puedo comprar esto?', tabBarIcon: icon('sliders') }}
      />
      {/* El hueco del centro: un botón, no una pestaña */}
      <Tabs.Screen name="add" options={{ title: 'Agregar movimiento', tabBarButton: () => <AddButton /> }} />
      <Tabs.Screen
        name="products"
        options={{ title: 'Productos', headerTitle: 'Mis productos', tabBarIcon: icon('credit-card') }}
      />
      <Tabs.Screen
        name="monthly"
        options={{ title: 'Mensual', headerTitle: 'Ingresos y gastos fijos', tabBarIcon: icon('repeat') }}
      />
    </Tabs>
  );
}
