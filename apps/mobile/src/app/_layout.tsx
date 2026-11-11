import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { ApiError } from '@/api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx (p. ej. el 409 de un saldo viejo) no mejora al repetirlo; un fallo de red o un 5xx sí
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ title: 'GreenLight' }} />
    </QueryClientProvider>
  );
}
