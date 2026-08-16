import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { listarTiposElemento, obtenerTipoElemento, validarElementoMC } from './documento-registro-tipos.js';
import { definicionesTiposIniciales } from './documento-tipos-iniciales.js';
import { definicionesTiposAvanzados } from './documento-tipos-avanzados.js';

function elementoBase(tipo: string, contenido: Record<string, unknown>) {
  return { id: 'el-1', tipo, posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 }, contenido };
}

const definicionesTodas = [...definicionesTiposIniciales, ...definicionesTiposAvanzados];

describe('inicializarMotorDocumental — bootstrap explícito del registro de tipos', () => {
  it('registra exactamente los trece tipos de la aplicación (Incrementos 1, 6 y 7)', () => {
    inicializarMotorDocumental();
    const tipos = listarTiposElemento().map((t) => t.tipo).sort();
    expect(tipos).toEqual(definicionesTodas.map((d) => d.tipo).sort());
    for (const definicion of definicionesTodas) {
      expect(() => obtenerTipoElemento(definicion.tipo)).not.toThrow();
    }
  });

  it('una segunda llamada es un no-op: no duplica entradas ni deja el registro inconsistente', () => {
    inicializarMotorDocumental();
    const antes = listarTiposElemento().length;

    inicializarMotorDocumental();
    inicializarMotorDocumental();

    const despues = listarTiposElemento().length;
    expect(despues).toBe(antes);
    expect(despues).toBe(definicionesTodas.length);
  });

  it('instanciaComponente (Incremento 6) acepta componenteId+version reales', () => {
    inicializarMotorDocumental();
    const elemento = validarElementoMC(elementoBase('instanciaComponente', { componenteId: 'comp-1', version: 1 }));
    expect(elemento.contenido).toEqual({ componenteId: 'comp-1', version: 1, overridesLocales: {} });
  });

  it('instanciaComponente rechaza un elemento sin componenteId', () => {
    inicializarMotorDocumental();
    expect(() => validarElementoMC(elementoBase('instanciaComponente', { version: 1 }))).toThrow();
  });
});
