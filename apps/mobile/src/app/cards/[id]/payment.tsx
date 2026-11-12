import { useLocalSearchParams } from 'expo-router';

import { PaymentForm } from '@/components/products/payment-form';

/** Abonar a la deuda de una tarjeta. */
export default function CardPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PaymentForm productId={Number(id)} kind="card" />;
}
