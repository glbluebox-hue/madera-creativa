import { generarId } from './mock.js';
import type { DocumentoMC, ElementoMC, PaginaMC, PosicionMC, TamanoMC } from './documento-modelo.js';

/**
 * Motor de edición del Motor Documental (Incremento 2, sección 7 de
 * ARQUITECTURA-MOTOR-DOCUMENTAL.md) — funciones puras: `(DocumentoMC, ...) => DocumentoMC`
 * nuevo, nunca mutan el documento recibido. Es la única vía para modificar
 * un `DocumentoMC` en el editor (Regla de Oro 3: toda mutación pasa por
 * comandos, nunca manipulación directa del DOM/render) — tanto los
 * controles de la interfaz como (en incrementos futuros) la IA y las
 * automatizaciones deben llamar exclusivamente a estas funciones.
 *
 * No conocen React ni ningún detalle de render (Regla de Oro 2) — el editor
 * (`editor-documento.tsx`) las envuelve en un historial de deshacer/rehacer,
 * pero la lógica de edición en sí vive aquí, aislada y comprobable sin UI.
 */

/** Ubica un elemento en el documento por id — busca en encabezado/pie por defecto y en cada página (incluidos encabezado/pie propios). Undefined si no existe. */
export function localizarElemento(documento: DocumentoMC, elementoId: string): { elemento: ElementoMC } | undefined {
  for (const { elemento } of recorrerElementos(documento)) {
    if (elemento.id === elementoId) return { elemento };
  }
  return undefined;
}

/** Recorre todos los elementos del documento (encabezado/pie por defecto + cada página y sus zonas), con una función para sustituirlos in-place sobre una copia mutable local. Mismo patrón que `recorrerElementosMC` del backend, replicado aquí porque este archivo no depende de Zod ni del backend. */
export function* recorrerElementos(documento: DocumentoMC): Generator<{ elemento: ElementoMC; paginaId: string | null; reemplazar: (nuevo: ElementoMC | null) => void }> {
  function* zona(elementos: ElementoMC[], paginaId: string | null) {
    for (let i = 0; i < elementos.length; i++) {
      const idx = i;
      yield {
        elemento: elementos[idx],
        paginaId,
        reemplazar: (nuevo: ElementoMC | null) => {
          if (nuevo) elementos[idx] = nuevo;
          else elementos.splice(idx, 1);
        },
      };
    }
  }
  if (documento.encabezadoPorDefecto && documento.encabezadoPorDefecto !== 'ninguno') yield* zona(documento.encabezadoPorDefecto.elementos, null);
  if (documento.piePorDefecto && documento.piePorDefecto !== 'ninguno') yield* zona(documento.piePorDefecto.elementos, null);
  for (const pagina of documento.paginas) {
    if (pagina.encabezado && pagina.encabezado !== 'ninguno') yield* zona(pagina.encabezado.elementos, pagina.id);
    if (pagina.pie && pagina.pie !== 'ninguno') yield* zona(pagina.pie.elementos, pagina.id);
    yield* zona(pagina.elementos, pagina.id);
  }
}

function clonar(documento: DocumentoMC): DocumentoMC {
  return structuredClone(documento);
}

function mapaPaginas(documento: DocumentoMC): Map<string, PaginaMC> {
  return new Map(documento.paginas.map((p) => [p.id, p]));
}

// ── 7.1/7.2 Selección — vive en el estado del editor (fuera de este archivo), no en el documento. ──

// ── Creación de elementos ───────────────────────────────────────────────────────

export function crearElementoBase(tipo: string, posicion: PosicionMC, tamano: TamanoMC): ElementoMC {
  return {
    id: generarId(),
    tipo,
    posicion,
    tamano,
    rotacion: 0,
    capa: 0,
    grupoId: null,
    bloqueado: false,
    restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
    opacidad: 1,
    origenComponente: null,
    estiloNombradoId: null,
    contenido: {},
    propiedadesEspecificas: {},
    estilo: {},
  };
}

/** Añade un elemento ya construido a la página indicada, en la capa más alta existente + 1. */
export function anadirElemento(documento: DocumentoMC, paginaId: string, elemento: ElementoMC): DocumentoMC {
  const copia = clonar(documento);
  const pagina = mapaPaginas(copia).get(paginaId);
  if (!pagina) return documento;
  const capaMax = pagina.elementos.reduce((max, e) => Math.max(max, e.capa), -1);
  pagina.elementos.push({ ...elemento, capa: capaMax + 1 });
  return copia;
}

/** Elimina uno o varios elementos por id, estén donde estén (página, encabezado o pie). */
export function eliminarElementos(documento: DocumentoMC, ids: string[]): DocumentoMC {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (idsSet.has(elemento.id)) reemplazar(null);
  }
  return copia;
}

// ── Transformación ──────────────────────────────────────────────────────────────

export function moverElementos(documento: DocumentoMC, ids: string[], deltaX: number, deltaY: number): DocumentoMC {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id) || elemento.bloqueado) continue;
    reemplazar({ ...elemento, posicion: { x: elemento.posicion.x + deltaX, y: elemento.posicion.y + deltaY } });
  }
  return copia;
}

export function redimensionarElemento(documento: DocumentoMC, id: string, tamano: TamanoMC, posicion?: PosicionMC): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id || elemento.bloqueado) continue;
    reemplazar({ ...elemento, tamano, posicion: posicion ?? elemento.posicion });
  }
  return copia;
}

export function rotarElemento(documento: DocumentoMC, id: string, rotacion: number): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id || elemento.bloqueado) continue;
    reemplazar({ ...elemento, rotacion });
  }
  return copia;
}

export function establecerOpacidad(documento: DocumentoMC, id: string, opacidad: number): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, opacidad: Math.min(1, Math.max(0, opacidad)) });
  }
  return copia;
}

/** Motor de restricciones (sección 11) — `visibilidad` ya se aplica desde el Incremento 8 (exportación), aquí solo se permite editarla. */
export function establecerVisibilidad(documento: DocumentoMC, id: string, visibilidad: ElementoMC['restricciones']['visibilidad']): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, restricciones: { ...elemento.restricciones, visibilidad } });
  }
  return copia;
}

/** Motor de restricciones (Incremento 10) — no impide seleccionar/mover/reestilar, solo el contenido (ver `actualizarContenido`, que ya respeta este campo). */
export function establecerSoloLectura(documento: DocumentoMC, id: string, soloLectura: boolean): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, restricciones: { ...elemento.restricciones, soloLectura } });
  }
  return copia;
}

/** Motor de restricciones (Incremento 10) — no bloquea nada por sí mismo; su efecto real es la validación previa a exportar (ver `elementoObligatorioIncompleto` en editor-documento.tsx). */
export function establecerObligatorio(documento: DocumentoMC, id: string, obligatorio: boolean): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, restricciones: { ...elemento.restricciones, obligatorio } });
  }
  return copia;
}

// ── Contenido / estilo / propiedades específicas ────────────────────────────────

/**
 * Único punto donde se escribe `contenido` (Regla de Oro 3: humano, IA y
 * automatizaciones pasan todos por aquí) — por eso es también el único
 * sitio donde hace falta comprobar `restricciones.soloLectura`: un
 * elemento de solo lectura se puede seleccionar/mover/reestilar (motor de
 * restricciones, Incremento 10), pero esta llamada se ignora sin más.
 */
export function actualizarContenido(documento: DocumentoMC, id: string, contenido: Record<string, unknown>): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id || elemento.restricciones.soloLectura) continue;
    reemplazar({ ...elemento, contenido: { ...elemento.contenido, ...contenido } });
  }
  return copia;
}

export function actualizarEstilo(documento: DocumentoMC, ids: string[], estilo: Record<string, unknown>): DocumentoMC {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id)) continue;
    reemplazar({ ...elemento, estilo: { ...elemento.estilo, ...estilo } });
  }
  return copia;
}

export function actualizarPropiedadesEspecificas(documento: DocumentoMC, id: string, propiedades: Record<string, unknown>): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, propiedadesEspecificas: { ...elemento.propiedadesEspecificas, ...propiedades } });
  }
  return copia;
}

// ── 7.7 Copiar/duplicar ──────────────────────────────────────────────────────────

const OFFSET_DUPLICADO = 16;

/** Duplica los elementos indicados con ids nuevos y un desplazamiento visible, conservando el grupo relativo entre ellos (mismo `grupoId` nuevo compartido si el original ya estaba agrupado). Devuelve el documento y los ids de las copias, para poder seleccionarlas inmediatamente. */
export function duplicarElementos(documento: DocumentoMC, ids: string[]): { documento: DocumentoMC; nuevosIds: string[] } {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  const nuevosIds: string[] = [];
  const mapaGrupos = new Map<string, string>();
  for (const pagina of copia.paginas) {
    const nuevos: ElementoMC[] = [];
    for (const elemento of pagina.elementos) {
      if (!idsSet.has(elemento.id)) continue;
      let grupoId: string | null = null;
      if (elemento.grupoId) {
        grupoId = mapaGrupos.get(elemento.grupoId) ?? generarId();
        mapaGrupos.set(elemento.grupoId, grupoId);
      }
      const nuevoId = generarId();
      nuevosIds.push(nuevoId);
      nuevos.push({
        ...elemento,
        id: nuevoId,
        grupoId,
        posicion: { x: elemento.posicion.x + OFFSET_DUPLICADO, y: elemento.posicion.y + OFFSET_DUPLICADO },
      });
    }
    pagina.elementos.push(...nuevos);
  }
  return { documento: copia, nuevosIds };
}

// ── 7.3 Agrupación ───────────────────────────────────────────────────────────────

export function agruparElementos(documento: DocumentoMC, ids: string[]): DocumentoMC {
  if (ids.length < 2) return documento;
  const copia = clonar(documento);
  const grupoId = generarId();
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id)) continue;
    reemplazar({ ...elemento, grupoId });
  }
  return copia;
}

export function desagruparElementos(documento: DocumentoMC, grupoId: string): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.grupoId !== grupoId) continue;
    reemplazar({ ...elemento, grupoId: null });
  }
  return copia;
}

/** Ids de todos los elementos que comparten `grupoId` con el elemento dado (incluido él mismo). Si no pertenece a ningún grupo, devuelve solo su propio id. */
export function idsDelGrupo(documento: DocumentoMC, elementoId: string): string[] {
  const objetivo = localizarElemento(documento, elementoId)?.elemento;
  if (!objetivo || !objetivo.grupoId) return [elementoId];
  const ids: string[] = [];
  for (const { elemento } of recorrerElementos(documento)) {
    if (elemento.grupoId === objetivo.grupoId) ids.push(elemento.id);
  }
  return ids;
}

// ── 7.4 Bloqueo ───────────────────────────────────────────────────────────────────

export function establecerBloqueo(documento: DocumentoMC, ids: string[], bloqueado: boolean): DocumentoMC {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id)) continue;
    reemplazar({ ...elemento, bloqueado });
  }
  return copia;
}

// ── 7.9 Capas ────────────────────────────────────────────────────────────────────

export type DireccionCapa = 'arriba' | 'abajo' | 'frente' | 'fondo';

/** Reordena la capa de un elemento dentro de su propia página — 'arriba'/'abajo' intercambian con el vecino inmediato, 'frente'/'fondo' lo llevan al extremo. Renumera todas las capas de la página de forma consecutiva (0..n-1) para que `capa` sea siempre un orden limpio, sin huecos. */
export function cambiarCapa(documento: DocumentoMC, id: string, direccion: DireccionCapa): DocumentoMC {
  const copia = clonar(documento);
  for (const pagina of copia.paginas) {
    const idx = pagina.elementos.findIndex((e) => e.id === id);
    if (idx === -1) continue;
    const ordenados = [...pagina.elementos].sort((a, b) => a.capa - b.capa);
    const posActual = ordenados.findIndex((e) => e.id === id);
    let posNueva = posActual;
    if (direccion === 'arriba') posNueva = Math.min(posActual + 1, ordenados.length - 1);
    if (direccion === 'abajo') posNueva = Math.max(posActual - 1, 0);
    if (direccion === 'frente') posNueva = ordenados.length - 1;
    if (direccion === 'fondo') posNueva = 0;
    const [movido] = ordenados.splice(posActual, 1);
    ordenados.splice(posNueva, 0, movido);
    ordenados.forEach((e, i) => { e.capa = i; });
    pagina.elementos = ordenados;
    break;
  }
  return copia;
}

// ── 7.5 Alineación / 7.6 Distribución ───────────────────────────────────────────

export type TipoAlineacion = 'izquierda' | 'derecha' | 'centroH' | 'arriba' | 'abajo' | 'centroV';

export function alinear(documento: DocumentoMC, ids: string[], tipo: TipoAlineacion): DocumentoMC {
  if (ids.length < 2) return documento;
  const elementos = ids.map((id) => localizarElemento(documento, id)?.elemento).filter((e): e is ElementoMC => !!e);
  if (elementos.length < 2) return documento;
  const minX = Math.min(...elementos.map((e) => e.posicion.x));
  const maxX = Math.max(...elementos.map((e) => e.posicion.x + e.tamano.ancho));
  const minY = Math.min(...elementos.map((e) => e.posicion.y));
  const maxY = Math.max(...elementos.map((e) => e.posicion.y + e.tamano.alto));
  const centroX = (minX + maxX) / 2;
  const centroY = (minY + maxY) / 2;

  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id) || elemento.bloqueado) continue;
    const { x, y } = elemento.posicion;
    const nueva: PosicionMC =
      tipo === 'izquierda' ? { x: minX, y } :
      tipo === 'derecha' ? { x: maxX - elemento.tamano.ancho, y } :
      tipo === 'centroH' ? { x: centroX - elemento.tamano.ancho / 2, y } :
      tipo === 'arriba' ? { x, y: minY } :
      tipo === 'abajo' ? { x, y: maxY - elemento.tamano.alto } :
      { x, y: centroY - elemento.tamano.alto / 2 };
    reemplazar({ ...elemento, posicion: nueva });
  }
  return copia;
}

export function distribuir(documento: DocumentoMC, ids: string[], eje: 'horizontal' | 'vertical'): DocumentoMC {
  if (ids.length < 3) return documento;
  const elementos = ids
    .map((id) => localizarElemento(documento, id)?.elemento)
    .filter((e): e is ElementoMC => !!e)
    .sort((a, b) => (eje === 'horizontal' ? a.posicion.x - b.posicion.x : a.posicion.y - b.posicion.y));
  if (elementos.length < 3) return documento;

  const primero = elementos[0];
  const ultimo = elementos[elementos.length - 1];
  const extremoInicio = eje === 'horizontal' ? primero.posicion.x : primero.posicion.y;
  const extremoFin = eje === 'horizontal' ? ultimo.posicion.x + ultimo.tamano.ancho : ultimo.posicion.y + ultimo.tamano.alto;
  const sumaTamanos = elementos.reduce((acc, e) => acc + (eje === 'horizontal' ? e.tamano.ancho : e.tamano.alto), 0);
  const hueco = (extremoFin - extremoInicio - sumaTamanos) / (elementos.length - 1);

  const nuevasPosiciones = new Map<string, number>();
  let cursor = extremoInicio;
  for (const e of elementos) {
    nuevasPosiciones.set(e.id, cursor);
    cursor += (eje === 'horizontal' ? e.tamano.ancho : e.tamano.alto) + hueco;
  }

  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!nuevasPosiciones.has(elemento.id) || elemento.bloqueado) continue;
    const valor = nuevasPosiciones.get(elemento.id)!;
    reemplazar({
      ...elemento,
      posicion: eje === 'horizontal' ? { ...elemento.posicion, x: valor } : { ...elemento.posicion, y: valor },
    });
  }
  return copia;
}

// ── Páginas ──────────────────────────────────────────────────────────────────────

export function anadirPagina(documento: DocumentoMC): DocumentoMC {
  const copia = clonar(documento);
  const indice = copia.paginas.length;
  copia.paginas.push({
    id: generarId(),
    indice,
    nombre: '',
    configuracion: null,
    fondo: null,
    encabezado: null,
    pie: null,
    numeracion: { mostrar: false, formato: 'Página {n} de {total}', posicion: 'centro' },
    elementos: [],
  });
  return copia;
}

export function eliminarPagina(documento: DocumentoMC, paginaId: string): DocumentoMC {
  if (documento.paginas.length <= 1) return documento;
  const copia = clonar(documento);
  copia.paginas = copia.paginas.filter((p) => p.id !== paginaId).map((p, i) => ({ ...p, indice: i }));
  return copia;
}

/** Fondo de una página (color, imagen subida por el usuario o ninguno) — `null` = usa el fondo blanco por defecto. */
export function establecerFondoPagina(documento: DocumentoMC, paginaId: string, fondo: PaginaMC['fondo']): DocumentoMC {
  const copia = clonar(documento);
  const pagina = copia.paginas.find((p) => p.id === paginaId);
  if (!pagina) return documento;
  pagina.fondo = fondo;
  return copia;
}

// ── Sistema de estilos (Incremento 3) ───────────────────────────────────────────

/** Crea un estilo con nombre a partir de un `estilo` embebido existente (ej. "guardar como estilo" desde un elemento ya formateado a mano). Devuelve el documento y el id del estilo nuevo, para poder aplicarlo de inmediato. */
export function crearEstiloNombrado(documento: DocumentoMC, nombre: string, valores: Record<string, unknown>): { documento: DocumentoMC; id: string } {
  const copia = clonar(documento);
  const id = generarId();
  copia.estilosGuardados.push({ id, nombre, valores });
  return { documento: copia, id };
}

/** Actualiza los valores de un estilo con nombre — afecta a todos los elementos que lo referencian por `estiloNombradoId`, sin tocarlos uno a uno (es la razón de ser de un estilo con nombre frente al estilo embebido). */
export function actualizarEstiloNombrado(documento: DocumentoMC, estiloId: string, valores: Record<string, unknown>): DocumentoMC {
  const copia = clonar(documento);
  const estilo = copia.estilosGuardados.find((e) => e.id === estiloId);
  if (!estilo) return documento;
  estilo.valores = { ...estilo.valores, ...valores };
  return copia;
}

export function renombrarEstiloNombrado(documento: DocumentoMC, estiloId: string, nombre: string): DocumentoMC {
  const copia = clonar(documento);
  const estilo = copia.estilosGuardados.find((e) => e.id === estiloId);
  if (!estilo) return documento;
  estilo.nombre = nombre;
  return copia;
}

/** Elimina un estilo con nombre del catálogo del documento y desvincula (no borra) los elementos que lo usaban — vuelven a depender solo de su estilo embebido. */
export function eliminarEstiloNombrado(documento: DocumentoMC, estiloId: string): DocumentoMC {
  const copia = clonar(documento);
  copia.estilosGuardados = copia.estilosGuardados.filter((e) => e.id !== estiloId);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.estiloNombradoId === estiloId) reemplazar({ ...elemento, estiloNombradoId: null });
  }
  return copia;
}

/** Vincula (o desvincula, con `estiloId: null`) uno o varios elementos a un estilo con nombre. */
export function aplicarEstiloNombrado(documento: DocumentoMC, ids: string[], estiloId: string | null): DocumentoMC {
  const copia = clonar(documento);
  const idsSet = new Set(ids);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (!idsSet.has(elemento.id)) continue;
    reemplazar({ ...elemento, estiloNombradoId: estiloId });
  }
  return copia;
}

/** Resuelve el estilo efectivo de un elemento: estilo con nombre (si tiene) como base, con el estilo embebido del propio elemento como override local encima — mismo orden que describe la sección 4 de la arquitectura ("estilo embebido → EstiloMC con nombre reutilizable"). */
export function resolverEstiloEfectivo(documento: DocumentoMC, elemento: ElementoMC): Record<string, unknown> {
  if (!elemento.estiloNombradoId) return elemento.estilo;
  const nombrado = documento.estilosGuardados.find((e) => e.id === elemento.estiloNombradoId);
  if (!nombrado) return elemento.estilo;
  return { ...nombrado.valores, ...elemento.estilo };
}

/** Fija (o quita, con `tema: null`) el tema propio del documento — `null` significa "usar el de la Empresa en vivo". */
export function establecerTema(documento: DocumentoMC, tema: DocumentoMC['tema']): DocumentoMC {
  return { ...clonar(documento), tema };
}

/** Sustituye por completo (no mezcla) el estilo embebido de un elemento — usado por `sincronizarEstiloConNombrado` para vaciarlo tras volcar sus valores al estilo con nombre. */
function reemplazarEstiloLocal(documento: DocumentoMC, id: string, estilo: Record<string, unknown>): DocumentoMC {
  const copia = clonar(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.id !== id) continue;
    reemplazar({ ...elemento, estilo });
  }
  return copia;
}

/** Vuelca el override local (`elemento.estilo`) al estilo con nombre que tiene aplicado y lo vacía — a partir de ahora ese ajuste pasa a formar parte del estilo compartido, en un único paso de deshacer. No hace nada si el elemento no tiene estilo con nombre. */
export function sincronizarEstiloConNombrado(documento: DocumentoMC, elementoId: string): DocumentoMC {
  const elemento = localizarElemento(documento, elementoId)?.elemento;
  if (!elemento || !elemento.estiloNombradoId) return documento;
  const actualizado = actualizarEstiloNombrado(documento, elemento.estiloNombradoId, elemento.estilo);
  return reemplazarEstiloLocal(actualizado, elementoId, {});
}

// ── Componentes reutilizables (Incremento 6) ────────────────────────────────────

/** Crea el elemento `instanciaComponente` a insertar en la página — vinculado por defecto (sección 3.4). */
export function crearElementoInstanciaComponente(componenteId: string, posicion: PosicionMC, tamano: TamanoMC): ElementoMC {
  return {
    ...crearElementoBase('instanciaComponente', posicion, tamano),
    origenComponente: { componenteId, version: 1, modo: 'vinculado' },
    contenido: { componenteId, version: 1, overridesLocales: {} },
  };
}

/**
 * Desvincula una instancia de componente (sección 7.12): sustituye el
 * elemento `instanciaComponente` por copias reales de los elementos del
 * componente (ids nuevos, agrupados por un `grupoId` común, posiciones
 * trasladadas de "relativas al componente" a "relativas a la página") —
 * a partir de aquí es un grupo de elementos normal, editable sin
 * restricción, y ya no depende del componente original.
 */
export function desvincularInstancia(documento: DocumentoMC, elementoId: string, elementosComponente: ElementoMC[], componenteId: string): DocumentoMC {
  const ubicado = localizarElemento(documento, elementoId);
  if (!ubicado || ubicado.elemento.tipo !== 'instanciaComponente') return documento;
  const instancia = ubicado.elemento;
  const grupoId = generarId();
  const materializados = elementosComponente.map((hijo) => ({
    ...hijo,
    id: generarId(),
    posicion: { x: instancia.posicion.x + hijo.posicion.x, y: instancia.posicion.y + hijo.posicion.y },
    grupoId,
    origenComponente: { componenteId, version: 1, modo: 'independiente' as const },
  }));

  const copia = clonar(documento);
  for (const pagina of copia.paginas) {
    const idx = pagina.elementos.findIndex((e) => e.id === elementoId);
    if (idx === -1) continue;
    pagina.elementos.splice(idx, 1, ...materializados);
    break;
  }
  return copia;
}
