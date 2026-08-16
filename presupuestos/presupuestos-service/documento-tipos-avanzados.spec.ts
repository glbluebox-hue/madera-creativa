import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { validarElementoMC, ErrorTipoElementoDesconocido } from './documento-registro-tipos.js';
import { definicionesTiposAvanzados } from './documento-tipos-avanzados.js';

function elementoBase(tipo: string, contenido: Record<string, unknown> = {}) {
  return { id: 'el-1', tipo, posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 }, contenido };
}

beforeAll(() => { inicializarMotorDocumental(); });

describe('tipos avanzados (Incremento 7) — registro', () => {
  it('los cinco tipos avanzados quedan registrados tras inicializar el motor', () => {
    for (const definicion of definicionesTiposAvanzados) {
      const elemento = validarElementoMC(elementoBase(definicion.tipo));
      expect(elemento.tipo).toBe(definicion.tipo);
    }
  });
});

describe('tabla', () => {
  it('acepta filas/columnas/celdas reales', () => {
    const elemento = validarElementoMC(elementoBase('tabla', { filas: 2, columnas: 3, celdas: [['A', 'B', 'C'], ['1', '2', '3']] }));
    expect(elemento.contenido).toMatchObject({ filas: 2, columnas: 3, celdas: [['A', 'B', 'C'], ['1', '2', '3']] });
  });
});

describe('firma', () => {
  it('contieneRecurso — acepta url + nombreFirmante', () => {
    const elemento = validarElementoMC(elementoBase('firma', { url: 'https://ejemplo.test/firma.png', nombreFirmante: 'Juan Pérez', fecha: '2026-08-11' }));
    expect(elemento.contenido).toMatchObject({ nombreFirmante: 'Juan Pérez' });
  });
});

describe('codigoQR', () => {
  it('acepta un valor de texto/URL a codificar', () => {
    const elemento = validarElementoMC(elementoBase('codigoQR', { valor: 'https://maderacreativa.example/presupuesto/123' }));
    expect(elemento.contenido).toEqual({ valor: 'https://maderacreativa.example/presupuesto/123' });
  });
});

describe('dibujo', () => {
  it('acepta una url renderizada con escenaExcalidraw opcional', () => {
    const elemento = validarElementoMC(elementoBase('dibujo', { url: 'https://ejemplo.test/dibujo.png', escenaExcalidraw: { elements: [], files: {} } }));
    expect((elemento.contenido as any).escenaExcalidraw).toEqual({ elements: [], files: {} });
  });
});

describe('bloqueIA', () => {
  it('empieza en estado "vacio" por defecto', () => {
    const elemento = validarElementoMC(elementoBase('bloqueIA', {}));
    expect(elemento.contenido).toEqual({ instrucciones: '', textoGenerado: '', estado: 'vacio' });
  });

  it('rechaza un estado que no sea uno de los tres válidos', () => {
    expect(() => validarElementoMC(elementoBase('bloqueIA', { estado: 'inventado' }))).toThrow();
  });
});

describe('tipo desconocido sigue rechazándose igual (regresión)', () => {
  it('un trece + uno inventado no cuela', () => {
    expect(() => validarElementoMC(elementoBase('tipoQueNoExisteDeVerdad'))).toThrow(ErrorTipoElementoDesconocido);
  });
});
