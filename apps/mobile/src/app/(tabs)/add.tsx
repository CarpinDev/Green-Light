import { Redirect } from 'expo-router';

// El "+" de la barra no es una pestaña: su botón (AddExpenseButton) abre el modal de gasto. Este
// archivo existe solo porque el Tabs necesita una ruta para ocupar el hueco del centro; si alguien
// llega aquí (una URL directa), se le manda al inicio.
export default function Add() {
  return <Redirect href="/" />;
}
