import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { schedule, type ScheduleRow } from '../src/amortization';

const R1 = new Decimal('0.01'); // 1 % M.V.

const sum = (rows: ScheduleRow[], key: 'capital' | 'interest' | 'prepayment') =>
    rows.reduce((acc, r) => acc + r[key], 0);

describe('amortization: abonos a capital', () => {
    describe('sin abonos no cambia nada', () => {
        it('cada fila trae prepayment = 0', () => {
            const rows = schedule(pesos(1_200_000), 12, [R1], 'constant_capital');
            expect(rows.every((r) => r.prepayment === 0)).toBe(true);
        });
    });

    describe('abono constante + reducir cuota', () => {
        // Después de 2 cuotas el saldo es 1.000.000; se abonan 300.000 → quedan 700.000 en 10 cuotas
        const rows = schedule(pesos(1_200_000), 12, [R1], 'constant_capital', {
            prepayments: [{ afterPeriod: 2, amount: pesos(300_000), mode: 'reduce_payment' }],
        });

        it('el abono queda en la cuota 3 y su saldo inicial ya viene descontado', () => {
            expect(rows[2]?.prepayment).toBe(pesos(300_000));
            expect(rows[2]?.openingBalance).toBe(pesos(700_000));
        });

        it('mantiene las 12 cuotas y el capital baja a 70.000', () => {
            expect(rows).toHaveLength(12);
            expect(rows[2]?.capital).toBe(pesos(70_000));
            expect(rows[11]?.capital).toBe(pesos(70_000));
            expect(rows[2]?.interest).toBe(pesos(7_000));
        });

        it('el total de intereses baja de 78.000 a 61.500', () => {
            expect(sum(rows, 'interest')).toBe(pesos(61_500));
        });
    });

    describe('abono constante + reducir plazo', () => {
        // Saldo 1.000.000 − 250.000 = 750.000 con capital de 100.000 → 7 cuotas de 100.000 y una de 50.000
        const rows = schedule(pesos(1_200_000), 12, [R1], 'constant_capital', {
            prepayments: [{ afterPeriod: 2, amount: pesos(250_000), mode: 'reduce_term' }],
        });

        it('conserva el capital de 100.000 por cuota', () => {
            expect(rows[2]?.capital).toBe(pesos(100_000));
            expect(rows[8]?.capital).toBe(pesos(100_000));
        });

        it('termina en la cuota 10 y la última solo lleva lo que falta', () => {
            expect(rows).toHaveLength(10);
            expect(rows[9]?.capital).toBe(pesos(50_000));
            expect(rows[9]?.closingBalance).toBe(0);
        });

        it('el total de intereses baja a 55.000', () => {
            expect(sum(rows, 'interest')).toBe(pesos(55_000));
        });
    });

    describe('cuota fija + reducir cuota', () => {
        // 1.000.000 a 12 meses: cuota 88.848,79. Abono de 200.000 después de 3 cuotas
        const rows = schedule(pesos(1_000_000), 12, [R1], 'fixed_installment', {
            prepayments: [{ afterPeriod: 3, amount: pesos(200_000), mode: 'reduce_payment' }],
        });

        it('las cuotas antes del abono no cambian', () => {
            expect(rows[2]?.payment).toBe(8_884_879);
        });

        it('recalcula la cuota sobre el saldo nuevo y las 9 cuotas restantes', () => {
            expect(rows[3]?.prepayment).toBe(pesos(200_000));
            expect(rows[3]?.openingBalance).toBe(56_108_028);
            expect(rows[3]?.payment).toBe(6_550_072);
            expect(rows[10]?.payment).toBe(6_550_072);
        });

        it('mantiene las 12 cuotas y cierra en 0', () => {
            expect(rows).toHaveLength(12);
            expect(rows[11]?.closingBalance).toBe(0);
        });
    });

    describe('cuota fija + reducir plazo', () => {
        const rows = schedule(pesos(1_000_000), 12, [R1], 'fixed_installment', {
            prepayments: [{ afterPeriod: 3, amount: pesos(200_000), mode: 'reduce_term' }],
        });

        it('conserva la cuota de 88.848,79', () => {
            expect(rows[3]?.payment).toBe(8_884_879);
            expect(rows[8]?.payment).toBe(8_884_879);
        });

        it('termina en la cuota 10 con una última cuota menor', () => {
            expect(rows).toHaveLength(10);
            expect(rows[9]?.capital).toBe(4_899_893);
            expect(rows[9]?.payment).toBe(4_948_892);
            expect(rows[9]?.closingBalance).toBe(0);
        });
    });

    describe('abono mayor o igual al saldo', () => {
        const rows = schedule(pesos(1_200_000), 12, [R1], 'constant_capital', {
            prepayments: [{ afterPeriod: 2, amount: pesos(5_000_000), mode: 'reduce_term' }],
        });

        it('solo aplica el saldo pendiente y la deuda termina ahí', () => {
            expect(rows).toHaveLength(3);
            expect(rows[2]?.prepayment).toBe(pesos(1_000_000));
            expect(rows[2]?.payment).toBe(0);
            expect(rows[2]?.closingBalance).toBe(0);
        });
    });

    describe('invariante: capital + abonos = principal', () => {
        it.each([
            ['constant_capital', 'reduce_term'],
            ['constant_capital', 'reduce_payment'],
            ['fixed_installment', 'reduce_term'],
            ['fixed_installment', 'reduce_payment'],
        ] as const)('%s + %s', (method, mode) => {
            const rows = schedule(pesos(1_000_001), 12, [R1], method, {
                prepayments: [
                    { afterPeriod: 1, amount: pesos(123_457), mode },
                    { afterPeriod: 5, amount: pesos(99_999), mode },
                ],
            });
            expect(sum(rows, 'capital') + sum(rows, 'prepayment')).toBe(pesos(1_000_001));
            expect(rows.at(-1)?.closingBalance).toBe(0);
        });
    });

    describe('validaciones', () => {
        const run = (afterPeriod: number, amount: number) =>
            schedule(pesos(1_200_000), 12, [R1], 'constant_capital', {
                prepayments: [{ afterPeriod, amount, mode: 'reduce_term' }],
            });

        it('rechaza afterPeriod fuera de 0..n−1 o no entero', () => {
            expect(() => run(-1, pesos(1_000))).toThrow(RangeError);
            expect(() => run(12, pesos(1_000))).toThrow(RangeError);
            expect(() => run(1.5, pesos(1_000))).toThrow(RangeError);
        });

        it('rechaza montos <= 0 o con decimales', () => {
            expect(() => run(2, 0)).toThrow(RangeError);
            expect(() => run(2, -100)).toThrow(RangeError);
            expect(() => run(2, 10.5)).toThrow(RangeError);
        });

        it('rechaza dos abonos en el mismo periodo', () => {
            expect(() =>
                schedule(pesos(1_200_000), 12, [R1], 'constant_capital', {
                    prepayments: [
                        { afterPeriod: 2, amount: pesos(1_000), mode: 'reduce_term' },
                        { afterPeriod: 2, amount: pesos(2_000), mode: 'reduce_term' },
                    ],
                }),
            ).toThrow(RangeError);
        });

        it('reducir plazo con abono antes de la primera cuota conserva la cuota original', () => {
            const rows = schedule(pesos(1_000_000), 12, [R1], 'fixed_installment', {
                prepayments: [{ afterPeriod: 0, amount: pesos(200_000), mode: 'reduce_term' }],
            });
            expect(rows[0]?.payment).toBe(8_884_879);
            expect(rows).toHaveLength(10);
            expect(rows[9]?.capital).toBe(4_256_590);
        });
    });
});
