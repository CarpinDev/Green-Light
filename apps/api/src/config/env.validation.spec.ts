import { MIN_JWT_SECRET_LENGTH, validateEnv } from './env.validation';

// La API no debe arrancar abierta: sin secreto, con uno corto o sin código de invitación, falla al iniciar.

const valid = { JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH), INVITE_CODE: 'codigo-de-invitacion' };

describe('validateEnv', () => {
  it('con todo bien, devuelve la configuración y pone 30d por defecto', () => {
    expect(validateEnv(valid)).toMatchObject({ ...valid, JWT_EXPIRES_IN: '30d' });
  });

  it('respeta un JWT_EXPIRES_IN válido', () => {
    expect(validateEnv({ ...valid, JWT_EXPIRES_IN: '12h' })).toMatchObject({ JWT_EXPIRES_IN: '12h' });
  });

  it('deja pasar el resto de variables sin tocarlas', () => {
    expect(validateEnv({ ...valid, DB_HOST: 'localhost' })).toMatchObject({ DB_HOST: 'localhost' });
  });

  it('falla si falta JWT_SECRET', () => {
    expect(() => validateEnv({ INVITE_CODE: valid.INVITE_CODE })).toThrow(/JWT_SECRET no está definida/);
  });

  it('falla si JWT_SECRET está vacía o son solo espacios', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '' })).toThrow(/JWT_SECRET no está definida/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: '   ' })).toThrow(/JWT_SECRET no está definida/);
  });

  it('falla si JWT_SECRET es corta, y dice cuánto mide y cuánto necesita', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH - 1) })).toThrow(
      new RegExp(`muy corta \\(${MIN_JWT_SECRET_LENGTH - 1}\\).*${MIN_JWT_SECRET_LENGTH}`),
    );
  });

  it('acepta un secreto de exactamente el mínimo', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH) })).not.toThrow();
  });

  it('falla si falta INVITE_CODE', () => {
    expect(() => validateEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/INVITE_CODE no está definida/);
    expect(() => validateEnv({ ...valid, INVITE_CODE: '  ' })).toThrow(/INVITE_CODE no está definida/);
  });

  it('falla con una duración que no entiende', () => {
    expect(() => validateEnv({ ...valid, JWT_EXPIRES_IN: 'mucho' })).toThrow(/JWT_EXPIRES_IN "mucho"/);
  });

  it('junta todos los problemas en un solo mensaje', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET[\s\S]*INVITE_CODE/);
  });

  it('el mensaje nunca incluye el valor del secreto', () => {
    const secret = 'corta-pero-secreta';
    expect(() => validateEnv({ ...valid, JWT_SECRET: secret })).toThrow(/muy corta/);
    try {
      validateEnv({ ...valid, JWT_SECRET: secret });
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});
