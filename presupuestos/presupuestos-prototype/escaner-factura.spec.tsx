import { renderToStaticMarkup } from 'react-dom/server';
import { EscanerFactura } from './escaner-factura.js';
import type { Factura } from './types.js';

/**
 * Smoke tests de la interfaz de rectificativas (Fase interfaz, 25/09/2026) —
 * mismo patrón que el resto del módulo (`renderToStaticMarkup`, sin
 * infraestructura de tests de interacción de React, ver `candado-plan.spec.tsx`):
 * no se simula ningún clic ni efecto (`useEffect` no se ejecuta en un render
 * a markup estático) — solo se comprueba que el HTML inicial contiene lo
 * esperado según las props/`facturaEditar` de entrada. La lógica real de
 * cálculo (signo, motor fiscal) ya está cubierta en `motor-fiscal.spec.ts`;
 * esto solo verifica que la interfaz ofrece los controles pedidos.
 */
describe('EscanerFactura — selector de tipo de factura', () => {
  it('una factura nueva muestra el selector Normal/Rectificativa, por defecto en Normal', () => {
    const html = renderToStaticMarkup(
      <EscanerFactura clientes={[]} onGuardar={() => {}} onCerrar={() => {}} />
    );
    expect(html).toContain('Tipo de factura');
    expect(html).toContain('Normal');
    expect(html).toContain('Rectificativa');
    // No debe mostrarse todavía el bloque de campos de rectificativa (naturaleza por defecto 'normal').
    expect(html).not.toContain('Motivo de la rectificación');
  });

  it('editar una factura ya marcada como rectificativa muestra el motivo y el aviso de importe en positivo', () => {
    const facturaEditar: Factura = {
      id: 'f1', tipo: 'gasto', fecha: '2026-06-10', concepto: 'Devolución material', importe: 300,
      proveedor: 'Ferretería X', clienteId: '', creado: '2026-06-10T00:00:00.000Z',
      naturaleza: 'rectificativa', facturaOriginalId: 'orig1', motivoRectificacion: 'devolucion_mercancia',
    };
    const html = renderToStaticMarkup(
      <EscanerFactura clientes={[]} onGuardar={() => {}} onCerrar={() => {}} facturaEditar={facturaEditar} />
    );
    expect(html).toContain('Motivo de la rectificación');
    expect(html).toContain('en positivo');
    // El desplegable de motivo debe traer preseleccionado el valor guardado.
    expect(html).toContain('devolucion_mercancia');
  });

  it('una factura normal (naturaleza ausente, como el histórico) no muestra los campos de rectificativa', () => {
    const facturaEditar: Factura = {
      id: 'f2', tipo: 'ingreso', fecha: '2026-01-01', concepto: '', importe: 500,
      proveedor: 'Cliente Y', clienteId: '', creado: '2026-01-01T00:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <EscanerFactura clientes={[]} onGuardar={() => {}} onCerrar={() => {}} facturaEditar={facturaEditar} />
    );
    expect(html).not.toContain('Motivo de la rectificación');
    expect(html).not.toContain('Factura original');
  });
});
