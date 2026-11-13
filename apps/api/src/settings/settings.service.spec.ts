import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FakeDb } from '../testing/fake-db';
import { Settings } from './entities/settings.entity';
import { SettingsService } from './settings.service';
import { USER } from '../testing/users';

// La fila única de ajustes (id = 1) con los umbrales por defecto del motor.

const D = (v: string) => new Decimal(v);

describe('SettingsService', () => {
  let db: FakeDb;
  let service: SettingsService;

  beforeEach(() => {
    db = new FakeDb();
    db.keyBy.set(Settings, 'userId');
    db.seed(Settings, [
      {
        userId: USER,
        yellowBelowIncomePct: D('0.1000'),
        cardUtilizationPct: D('0.3000'),
        debtToIncomePct: D('0.3000'),
        statementTolerancePct: D('0.0200'),
      },
    ]);
    service = new SettingsService(db.dataSource());
  });

  it('GET devuelve los 4 umbrales como texto', async () => {
    await expect(service.get(USER)).resolves.toEqual({
      yellowBelowIncomePct: '0.1',
      cardUtilizationPct: '0.3',
      debtToIncomePct: '0.3',
      statementTolerancePct: '0.02',
    });
  });

  it('PATCH cambia solo el umbral que llega y devuelve los 4', async () => {
    const result = await service.update(USER, { cardUtilizationPct: '0.25' });
    expect(result).toEqual({
      yellowBelowIncomePct: '0.1',
      cardUtilizationPct: '0.25',
      debtToIncomePct: '0.3',
      statementTolerancePct: '0.02',
    });
    expect(db.rows(Settings)).toHaveLength(1); // actualiza la fila, no crea otra
    await expect(service.get(USER)).resolves.toMatchObject({ cardUtilizationPct: '0.25' });
  });

  it('acepta cambiar varios a la vez y los extremos 0 y 1', async () => {
    const result = await service.update(USER, { yellowBelowIncomePct: '0', debtToIncomePct: '1' });
    expect(result).toMatchObject({ yellowBelowIncomePct: '0', debtToIncomePct: '1', cardUtilizationPct: '0.3' });
  });

  it('un umbral fuera de 0..1 es 400 y no cambia nada', async () => {
    await expect(service.update(USER, { cardUtilizationPct: '1.5' })).rejects.toThrow(/fuera de rango/);
    await expect(service.update(USER, { cardUtilizationPct: '-0.1' })).rejects.toThrow(BadRequestException);
    await expect(service.update(USER, { cardUtilizationPct: 'abc' })).rejects.toThrow(BadRequestException);
    await expect(service.get(USER)).resolves.toMatchObject({ cardUtilizationPct: '0.3' });
  });

  it('si un umbral es inválido no se guarda ninguno de los otros', async () => {
    await expect(service.update(USER, { yellowBelowIncomePct: '0.2', debtToIncomePct: '2' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.get(USER)).resolves.toMatchObject({ yellowBelowIncomePct: '0.1' });
  });

  it('un PATCH vacío es 400', async () => {
    await expect(service.update(USER, {})).rejects.toThrow(/al menos un umbral/i);
  });

  it('si falta la fila (no se corrieron las migraciones) es un error del sistema, no del usuario', async () => {
    db.tables.clear();
    await expect(service.get(USER)).rejects.toThrow(InternalServerErrorException);
  });
});
