import Decimal from "decimal.js";

export interface Rate {
    ea: Decimal;
    mv: Decimal;
}

interface Entry {
    date: string;
    rate: Rate;
}

/**
 * Valida que una tasa sea finita y no negativa.
 */
function assertValidRate(rate: Decimal, label: string): void {
    if (!rate.isFinite() || rate.isNegative()) {
        throw new Error(`La tasa ${label} debe ser finita y no negativa.`);
    }
}

/**
 * MV → EA
 * Tasa mensual vencida a efectiva anual.
 */
export function mvToEa(mv: Decimal): Decimal {
    assertValidRate(mv, "MV");

    return mv.plus(1).pow(12).minus(1);
}

/**
 * EA → MV
 * Tasa efectiva anual a mensual vencida.
 */
export function eaToMv(ea: Decimal): Decimal {
    assertValidRate(ea, "EA");

    return ea.plus(1)
        .pow(new Decimal(1).div(12))
        .minus(1)
        .toDecimalPlaces(12);
}

/**
 * Construye una tasa a partir de EA.
 */
export function rateFromEa(ea: Decimal | string): Rate {
    const effectiveAnnual = new Decimal(ea);

    return {
        ea: effectiveAnnual,
        mv: eaToMv(effectiveAnnual)
    };
}

/**
 * Construye una tasa a partir de MV.
 */
export function rateFromMv(mv: Decimal | string): Rate {
    const monthly = new Decimal(mv);

    return {
        ea: mvToEa(monthly),
        mv: monthly
    };
}

export class RateHistory {
    private entries: Entry[] = [];

    add(effectiveFrom: string, rate: Rate): void {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
            throw new Error("Fecha inválida. Usa YYYY-MM-DD.");
        }

        // Reemplazar si ya existe una entrada con esa fecha.
        const existing = this.entries.find(
            e => e.date === effectiveFrom
        );

        if (existing) {
            existing.rate = rate;
            return;
        }

        // Agregar y ordenar.
        this.entries.push({
            date: effectiveFrom,
            rate
        });

        this.entries.sort((a, b) => a.date.localeCompare(b.date));
    }

    rateOn(day: string): Rate {
        let applicableEntry: Entry | undefined;

        for (const entry of this.entries) {
            if (entry.date <= day) {
                applicableEntry = entry;
            } else {
                break;
            }
        }

        if (!applicableEntry) {
            throw new Error(`No hay tasa vigente el ${day}`);
        }

        return applicableEntry.rate;
    }
}