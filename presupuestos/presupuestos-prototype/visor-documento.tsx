import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DocumentoMC, ElementoMC, ZonaMC, ComponenteMC } from './documento-modelo.js';
import { obtenerTipoRender } from './documento-registro-tipos-render.js';
import './documento-tipos-iniciales-render.js'; // registro de render por efecto secundario — mismo patrón que editor-documento.tsx.
import './documento-tipos-avanzados-render.js';
import { resolverZonaEfectiva, elementoVisibleEn, resolverElementoPresentacion } from './documento-render-compartido.js';
import editorStyles from './editor-documento.module.css';

/**
 * Visor de solo lectura de un `DocumentoMC` — Portal del cliente
 * (`portal-presupuesto.tsx`). Contrapartida sin edición de `editor-documento.tsx`:
 * pinta páginas + encabezado/pie + elementos con el mismo registro de tipos
 * y las mismas reglas de resolución (`documento-render-compartido.ts`), sin
 * `react-moveable`, sin barra de herramientas, sin paneles ni comandos.
 *
 * Reutiliza las clases `.pagina`/`.elemento` de `editor-documento.module.css`
 * (mismo aspecto visual que el editor) en vez de duplicar ese CSS aquí.
 */
export type VisorDocumentoProps = {
  documento: DocumentoMC;
  /** Logo de empresa para el tipo "logotipo" en modo 'vinculado' (`presupuesto.empresa.logo`). */
  logoEmpresa?: string;
  /** Precio del presupuesto para el tipo "precioDestacado" en modo 'vinculado' (`presupuesto.precioTotal`). */
  precioVinculado?: number;
  /** Componentes reutilizables referenciados por el documento (tipo "instanciaComponente"), ya resueltos por el servidor (`presupuesto.componentesResueltos`) — el Portal no tiene sesión con la que pedirlos por su cuenta. */
  componentes?: ComponenteMC[];
};

function renderElementoVisor(documento: DocumentoMC, elemento: ElementoMC, contexto: { logoEmpresa?: string; precioVinculado?: number }, resolverComponente: (id: string) => ComponenteMC | undefined) {
  if (!elementoVisibleEn(elemento, true)) return null; // true = "salida" (portal), mismo criterio que exportar/imprimir en el editor.
  const definicion = obtenerTipoRender(elemento.tipo);
  const elementoPresentacion = resolverElementoPresentacion(documento, elemento, contexto);
  return (
    <div
      key={elemento.id}
      className={editorStyles.elemento}
      // Rectángulo: la opacidad solo afecta al relleno, nunca al borde —
      // ver la nota gemela en `editor-documento.tsx` (mismo criterio para
      // que el Portal del cliente coincida con lo que se ve en el editor).
      style={{ left: elemento.posicion.x, top: elemento.posicion.y, width: elemento.tamano.ancho, height: elemento.tamano.alto, transform: `rotate(${elemento.rotacion}deg)`, opacity: elemento.tipo === 'rectangulo' ? 1 : elemento.opacidad, zIndex: elemento.capa }}
    >
      <definicion.Render elemento={elementoPresentacion} editando={false} onCambiarContenido={() => {}} onSalirEdicion={() => {}} resolverComponente={resolverComponente} />
    </div>
  );
}

function renderZonaVisor(documento: DocumentoMC, zona: ZonaMC | null, ancho: number, posicion: 'arriba' | 'abajo', contexto: { logoEmpresa?: string; precioVinculado?: number }, resolverComponente: (id: string) => ComponenteMC | undefined) {
  if (!zona) return null;
  return (
    <div style={{ position: 'absolute', left: 0, [posicion === 'arriba' ? 'top' : 'bottom']: 0, width: ancho, height: zona.altura }}>
      {zona.elementos.map((el) => renderElementoVisor(documento, el, contexto, resolverComponente))}
    </div>
  );
}

export function VisorDocumento({ documento, logoEmpresa, precioVinculado, componentes }: VisorDocumentoProps) {
  const contexto = { logoEmpresa, precioVinculado };
  // Ya resueltos por el servidor (`obtenerPresupuestoPublico`) — nunca se piden aparte desde aquí, el Portal no tiene sesión.
  const mapaComponentes = new Map((componentes ?? []).map((c) => [c.id, c]));
  const resolverComponente = (id: string) => mapaComponentes.get(id);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  // Escala responsive derivada del ancho real disponible (a diferencia del
  // editor, donde el zoom lo controla el propio carpintero con el gesto de
  // pellizcar) — el cliente que abre el enlace en el móvil nunca ha visto
  // el documento antes, así que tiene que caber por defecto, sin gesto
  // previo. Se recalcula si cambia el tamaño de la ventana (girar el móvil,
  // redimensionar) o el ancho de página del documento.
  const anchoMaximoPagina = Math.max(...documento.paginas.map((p) => (p.configuracion ?? documento.configuracionPorDefecto).ancho), 1);
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const recalcular = () => {
      const disponible = contenedor.clientWidth;
      setZoom(disponible > 0 ? Math.min(1, disponible / anchoMaximoPagina) : 1);
    };
    recalcular();
    window.addEventListener('resize', recalcular);
    return () => window.removeEventListener('resize', recalcular);
  }, [anchoMaximoPagina]);

  return (
    <div ref={contenedorRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
      {documento.paginas.map((pagina) => {
        const config = pagina.configuracion ?? documento.configuracionPorDefecto;
        const fondo = pagina.fondo;
        const encabezado = resolverZonaEfectiva(pagina.encabezado, documento.encabezadoPorDefecto);
        const pie = resolverZonaEfectiva(pagina.pie, documento.piePorDefecto);
        const estiloFondo: CSSProperties =
          fondo?.tipo === 'imagen' && fondo.imagenUrl
            ? {
                backgroundImage: `url(${fondo.imagenUrl})`,
                backgroundSize: fondo.ajuste === 'contener' ? 'contain' : fondo.ajuste === 'mosaico' ? 'auto' : 'cover',
                backgroundRepeat: fondo.ajuste === 'mosaico' ? 'repeat' : 'no-repeat',
                backgroundPosition: 'center',
              }
            : fondo?.tipo === 'color' && fondo.color
              ? { backgroundColor: fondo.color }
              : {};
        return (
          <div key={pagina.id} className={editorStyles.pagina} style={{ width: config.ancho * zoom, height: config.alto * zoom, ...estiloFondo }}>
            <div style={{ width: config.ancho, height: config.alto, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }}>
              {renderZonaVisor(documento, encabezado, config.ancho, 'arriba', contexto, resolverComponente)}
              {pagina.elementos.map((el) => renderElementoVisor(documento, el, contexto, resolverComponente))}
              {renderZonaVisor(documento, pie, config.ancho, 'abajo', contexto, resolverComponente)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
