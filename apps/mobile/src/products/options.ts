// Las opciones avanzadas de una tarjeta, con una explicación para quien no es experto en finanzas.
// Los valores son los del motor de cálculo; el texto es para la persona.

import type { FirstPeriodInterest, MinPaymentMethod } from '@/api/types';

interface Option<T extends string> {
  value: T;
  label: string;
  help: string;
}

export const PAYMENT_METHODS: readonly Option<MinPaymentMethod>[] = [
  {
    value: 'constant_capital',
    label: 'Abono constante',
    help: 'Cada mes pagas la misma parte de la deuda más los intereses del saldo: la cuota empieza más alta y va bajando. Es lo más común en tarjetas.',
  },
  {
    value: 'fixed_installment',
    label: 'Cuota fija',
    help: 'Pagas el mismo valor todos los meses: al principio casi todo son intereses y con el tiempo se va a la deuda.',
  },
];

export const FIRST_PERIOD_INTERESTS: readonly Option<FirstPeriodInterest>[] = [
  {
    value: 'prorated',
    label: 'Por los días',
    help: 'Si compras a mitad del ciclo, la primera cuota cobra intereses solo por los días que pasaron hasta el corte. Es lo más justo y lo habitual.',
  },
  {
    value: 'full_month',
    label: 'Mes completo',
    help: 'La primera cuota cobra un mes entero de intereses, aunque la compra haya sido pocos días antes del corte.',
  },
  {
    value: 'none',
    label: 'Sin interés',
    help: 'La primera cuota no cobra intereses: solo empiezan a contar desde el siguiente corte.',
  },
];

/** "Compras a 1 cuota sin interés": sí o no, con su explicación. */
export const SINGLE_INSTALLMENT_HELP =
  'Si pagas una compra en una sola cuota, no te cobran intereses por ella. Casi todos los bancos lo hacen así.';

export const helpOf = <T extends string>(options: readonly Option<T>[], value: T): string =>
  options.find((o) => o.value === value)?.help ?? '';
