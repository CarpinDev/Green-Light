import Decimal from 'decimal.js';

export type Cents = number;

/** Redondea un Decimal (expresado en centavos) al centavo más cercano, half-up. */
export function roundCents(value: Decimal): Cents {
    return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Pesos → centavos. Acepta number entero, string o Decimal. Rechaza floats. */
export function pesos(amount: number | string | Decimal): Cents {
    if (typeof amount === "number") {
        if (!Number.isSafeInteger(amount)) {
            throw new Error("El monto debe ser un número entero y seguro.");
        }
    }

    const value = new Decimal(amount);

    return roundCents(value.mul(100));
}

/** 123456789 → "$1.234.567,89"; omite ",00" si no hay centavos. */
export function formatCop(cents: Cents): string {
    const negative = cents < 0;
    const abs = Math.abs(cents);

    const pesos = Math.trunc(abs / 100);
    const centavos = abs % 100;

    const formattedPesos = pesos
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    const formattedCents = centavos
        .toString()
        .padStart(2, "0");

    const amount = centavos === 0
        ? formattedPesos
        : `${formattedPesos},${formattedCents}`;

    return `${negative ? "-" : ""}$${amount}`;
}