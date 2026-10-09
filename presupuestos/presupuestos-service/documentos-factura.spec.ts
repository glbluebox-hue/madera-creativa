import { sumaConSigno, generarResumenPdf } from './documentos-factura.service.js';

/**
 * Incidencia real (09/10/2026, asesor fiscal): el informe PDF para el
 * asesor sumaba `importe` a pelo en los totales de cabecera (Ingresos/
 * Gastos/Resultado), sin aplicar el signo de rectificativa — una devolución
 * se sumaba como un gasto/ingreso más en vez de restar, mientras que la
 * sección de IVA/IGIC del MISMO documento sí lo aplicaba correctamente
 * (`calcularImpuestosPorTipo`). `sumaConSigno` es la función que corrige
 * esto — mismo criterio que `calcularTrimestres` (frontend) y
 * `resumenFacturas`/`resumenEconomico` (este mismo backend).
 */
describe('sumaConSigno — totales del informe del asesor respetan rectificativas', () => {
  it('una factura normal suma en positivo', () => {
    expect(sumaConSigno([{ importe: 100 }])).toBe(100);
  });

  it('una factura sin naturaleza (histórico) se trata como normal', () => {
    expect(sumaConSigno([{ importe: 100, naturaleza: undefined }])).toBe(100);
  });

  it('una rectificativa resta en vez de sumar', () => {
    expect(sumaConSigno([{ importe: 100, naturaleza: 'rectificativa' }])).toBe(-100);
  });

  it('caso real: gasto normal + dos devoluciones (Leroy Merlin, Higinio Tabares) — el total queda neto, nunca inflado', () => {
    const total = sumaConSigno([
      { importe: 500, naturaleza: 'normal' },
      { importe: 25, naturaleza: 'rectificativa' }, // devolución Leroy Merlin
      { importe: 8, naturaleza: 'rectificativa' },  // devolución Higinio Tabares
    ]);
    // Sin el fix: 500 + 25 + 8 = 533 (incorrecto, infla el gasto en 66€).
    expect(total).toBe(500 - 25 - 8);
    expect(total).toBe(467);
  });

  it('varias facturas normales y rectificativas mezcladas', () => {
    const total = sumaConSigno([
      { importe: 1000, naturaleza: 'normal' },
      { importe: 50, naturaleza: 'rectificativa' },
      { importe: 200, naturaleza: 'normal' },
      { importe: 10, naturaleza: 'rectificativa' },
    ]);
    expect(total).toBe(1000 - 50 + 200 - 10);
  });

  it('array vacío suma 0', () => {
    expect(sumaConSigno([])).toBe(0);
  });
});

describe('generarResumenPdf — regresión con rectificativas mezcladas', () => {
  it('genera un PDF válido cuando hay una rectificativa de gasto (smoke test, no revienta ni produce un documento vacío)', async () => {
    const bytes = await generarResumenPdf({
      empresaNombre: 'Madera Creativa',
      periodoLabel: '3.er trimestre 2026',
      ingresos: [],
      gastos: [
        { fecha: '2026-07-10', numeroFactura: 'A-1', proveedor: 'Leroy Merlin', importe: 60, naturaleza: 'normal' },
        { fecha: '2026-08-02', numeroFactura: 'A-2', proveedor: 'Leroy Merlin', importe: 25, naturaleza: 'rectificativa' },
      ],
      avisoFiscal: [],
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
