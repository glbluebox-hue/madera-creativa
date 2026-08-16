import { registrarTipoRender, elementoObligatorioIncompleto, type DefinicionTipoRender } from './documento-registro-tipos-render.js';
import type { ElementoMC } from './documento-modelo.js';

const RenderVacio = (() => null) as unknown as DefinicionTipoRender['Render'];
const PanelVacio = (() => null) as unknown as DefinicionTipoRender['PanelPropiedades'];

registrarTipoRender({
  tipo: 'pruebaObligatorio',
  etiqueta: 'Prueba',
  insertableDesdeBarra: false,
  editableEnLienzo: false,
  tamanoInicial: { ancho: 10, alto: 10 },
  crearContenidoInicial: () => ({ texto: '' }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderVacio,
  PanelPropiedades: PanelVacio,
});

function elemento(overrides: Partial<ElementoMC>): ElementoMC {
  return {
    id: 'el-1', tipo: 'pruebaObligatorio', posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 },
    rotacion: 0, capa: 0, grupoId: null, bloqueado: false,
    restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
    opacidad: 1, origenComponente: null, estiloNombradoId: null,
    contenido: { texto: '' }, propiedadesEspecificas: {}, estilo: {},
    ...overrides,
  };
}

describe('elementoObligatorioIncompleto (Incremento 10 — motor de restricciones)', () => {
  it('no está incompleto si no es obligatorio, aunque el contenido esté vacío', () => {
    expect(elementoObligatorioIncompleto(elemento({ restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false } }))).toBe(false);
  });

  it('está incompleto si es obligatorio y el contenido sigue siendo el inicial del tipo', () => {
    expect(elementoObligatorioIncompleto(elemento({ restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: true }, contenido: { texto: '' } }))).toBe(true);
  });

  it('no está incompleto si es obligatorio pero el contenido ya cambió respecto al inicial', () => {
    expect(elementoObligatorioIncompleto(elemento({ restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: true }, contenido: { texto: 'ya relleno' } }))).toBe(false);
  });
});
