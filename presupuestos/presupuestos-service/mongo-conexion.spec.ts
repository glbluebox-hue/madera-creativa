import { verificarAislamientoEntorno } from './mongo-conexion.js';

describe('verificarAislamientoEntorno (aislamiento dev/test/produccion, 22/08/2026)', () => {
  const URL_PRODUCCION = 'mongodb+srv://usuario:clave@madera.qvszsal.mongodb.net/test?retryWrites=true&w=majority';
  const URL_LOCAL = 'mongodb://localhost:27017/madera-creativa-dev';

  it('deja pasar una URL que no es de producción, sin NODE_ENV=production', () => {
    expect(() => verificarAislamientoEntorno(URL_LOCAL, { nodeEnv: 'development' })).not.toThrow();
  });

  it('deja pasar la URL de producción cuando NODE_ENV=production', () => {
    expect(() => verificarAislamientoEntorno(URL_PRODUCCION, { nodeEnv: 'production' })).not.toThrow();
  });

  it('rechaza la URL de producción fuera de NODE_ENV=production', () => {
    expect(() => verificarAislamientoEntorno(URL_PRODUCCION, { nodeEnv: 'development' })).toThrow(/producción/i);
  });

  it('rechaza la URL de producción también sin NODE_ENV definida', () => {
    expect(() => verificarAislamientoEntorno(URL_PRODUCCION, {})).toThrow();
  });

  it('permite el escape explícito ALLOW_PROD_DB=true fuera de producción', () => {
    expect(() => verificarAislamientoEntorno(URL_PRODUCCION, { nodeEnv: 'development', allowProdDb: 'true' })).not.toThrow();
  });

  it('no basta con cualquier valor de ALLOW_PROD_DB — debe ser exactamente "true"', () => {
    expect(() => verificarAislamientoEntorno(URL_PRODUCCION, { nodeEnv: 'development', allowProdDb: '1' })).toThrow();
  });
});
