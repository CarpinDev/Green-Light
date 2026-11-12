import { useLocalSearchParams } from 'expo-router';

import { PaymentForm } from '@/components/products/payment-form';

/** Abonar a capital de un préstamo, con la vista previa de cómo queda. */
export default function LoanPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PaymentForm productId={Number(id)} kind="loan" />;
}
