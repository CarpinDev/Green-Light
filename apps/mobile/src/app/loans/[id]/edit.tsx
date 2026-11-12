import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { getJson } from '@/api/client';
import type { LoanDetail } from '@/api/types';
import { LoanForm } from '@/components/products/loan-form';
import { QueryState } from '@/components/query-state';

/** Editar un préstamo: nombre, cuota del banco y seguro. */
export default function EditLoan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // La misma consulta del detalle: abre al instante y comparte caché
  const loan = useQuery({ queryKey: ['loans', Number(id)], queryFn: () => getJson<LoanDetail>(`/loans/${id}`) });

  return (
    <QueryState query={loan} errorTitle="No se pudo cargar el préstamo.">
      {(data) => <LoanForm loan={data} />}
    </QueryState>
  );
}
