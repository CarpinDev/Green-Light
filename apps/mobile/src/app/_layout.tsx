import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ApiError } from '@/api/client';
import { CancelButton } from '@/components/cancel-button';
import { colors, fonts } from '@/theme/tokens';

// La splash se queda hasta que las fuentes carguen: sin esto, la app parpadea con la fuente del sistema
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx (p. ej. el 409 de un saldo viejo) no mejora al repetirlo; un fallo de red o un 5xx sí
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

const MONTHLY_MODALS = [
  { name: 'recurring-incomes/new', title: 'Nuevo ingreso' },
  { name: 'recurring-incomes/[id]', title: 'Editar ingreso' },
  { name: 'fixed-expenses/new', title: 'Nuevo gasto fijo' },
  { name: 'fixed-expenses/[id]', title: 'Editar gasto fijo' },
  { name: 'incomes/new', title: 'Nuevo ingreso' },
  { name: 'accounts/new', title: 'Nueva cuenta' },
  { name: 'cards/new', title: 'Nueva tarjeta' },
  { name: 'cards/[id]', title: 'Editar tarjeta' },
];

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    [fonts.body]: Inter_400Regular,
    [fonts.bodyMedium]: Inter_500Medium,
    [fonts.bodySemiBold]: Inter_600SemiBold,
    [fonts.bodyBold]: Inter_700Bold,
    [fonts.title]: SpaceGrotesk_600SemiBold,
    [fonts.display]: SpaceGrotesk_700Bold,
  });

  // Si una fuente falla, la app abre igual con la del sistema: mejor eso que una splash eterna
  const ready = loaded || fontError !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          title: 'GreenLight',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.title },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* Las pestañas traen su propio encabezado: el del Stack sobraría */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* El formulario de gasto se abre encima de las pestañas, como modal */}
        <Stack.Screen
          name="expenses/new"
          options={{ presentation: 'modal', title: 'Nuevo gasto', headerLeft: () => <CancelButton /> }}
        />
        {/* Las listas completas, en el stack (no modales): se entra desde Inicio y se vuelve con atrás */}
        <Stack.Screen name="movements" options={{ title: 'Movimientos' }} />
        <Stack.Screen name="upcoming" options={{ title: 'Próximos' }} />
        {/* Ingresos recurrentes y gastos fijos: crear y editar, también como modales */}
        {MONTHLY_MODALS.map(({ name, title }) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ presentation: 'modal', title, headerLeft: () => <CancelButton /> }}
          />
        ))}
      </Stack>
    </QueryClientProvider>
  );
}
