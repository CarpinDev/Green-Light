import Decimal from 'decimal.js';
import { nextRateOf } from './cards.service';
import type { ProductRate } from './entities/product-rate.entity';

const rate = (effectiveFrom: string, ea: string, mv: string) =>
  ({ productId: 1, effectiveFrom, ea: new Decimal(ea), mv: new Decimal(mv), source: 'ea' }) as ProductRate;

describe('nextRateOf: la próxima tasa programada', () => {
  const TODAY = '2026-11-12';

  it('sin tasas, null', () => expect(nextRateOf([], TODAY)).toBeNull());

  it('solo tasas pasadas (o de hoy), null: ya rigen', () => {
    expect(nextRateOf([rate('2026-01-01', '0.25', '0.0188'), rate(TODAY, '0.26', '0.0194')], TODAY)).toBeNull();
  });

  it('una futura: esa, con los decimales como texto', () => {
    expect(nextRateOf([rate('2026-01-01', '0.25', '0.0188'), rate('2026-11-13', '0.2859', '0.0212')], TODAY)).toEqual({
      effectiveFrom: '2026-11-13',
      ea: '0.2859',
      mv: '0.0212',
    });
  });

  it('varias futuras: la más cercana a hoy', () => {
    const rates = [
      rate('2027-01-01', '0.3', '0.022'),
      rate('2026-12-01', '0.29', '0.0214'),
      rate('2027-03-01', '0.31', '0.0227'),
    ];
    expect(nextRateOf(rates, TODAY)?.effectiveFrom).toBe('2026-12-01');
  });
});
