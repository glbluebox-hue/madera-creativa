import { randomUUID, createHash } from 'node:crypto';
import { conectar } from './cliente.model.js';
import { InvestigacionMercadoModel } from './investigacion-mercado.model.js';
import { registrarUsoIA } from './ia-uso.model.js';
import { buscarEnWeb, extraerJsonEstructurado } from './ia-proveedor-openai.js';
import { construirPromptBusqueda, construirPromptExtraccion, ESQUEMA_CANDIDATOS_MERCADO } from './investigacion-mercado-prompt.js';
import type { ContextoBusquedaMercado } from './investigacion-mercado-prompt.js';
import { PresupuestosService } from './presupuestos-service.js';

const svc = PresupuestosService.from();

/** Ventana de reutilización de una investigación equivalente (encargo, punto 10) — 24h como primera aproximación. */
const VENTANA_CACHE_MS = 24 * 60 * 60 * 1000;

const NOMBRE_CAPACIDAD = 'buscar-precios-mercado';

export type CandidatoMercado = {
  precio: number | null;
  moneda: string | null;
  ubicacion: string | null;
  tipoTrabajoDetectado: string | null;
  queIncluye: string | null;
  queNoIncluye: string | null;
  calidad: 'economico' | 'estandar' | 'alto' | null;
  ivaIncluido: 'si' | 'no' | 'desconocido';
  instalacionIncluida: 'si' | 'no' | 'desconocido';
  fechaReferencia: string | null;
  fuente: string | null;
  url: string | null;
  extracto: string | null;
  confianza: 'alta' | 'media' | 'baja';
  explicacionComparabilidad: string | null;
};

type FormaCandidatosMercado = {
  sinResultadosFiables: boolean;
  motivoSinResultados: string | null;
  candidatos: CandidatoMercado[];
};

export type ParametrosInvestigarMercado = {
  usuarioId: string;
  tipoTrabajo: string;
  nivelGeografico: 'local' | 'regional' | 'nacional';
  alcance: 'solo_mobiliario' | 'mobiliario_encimera' | 'reforma_completa';
  nivelCalidad: 'economico' | 'estandar' | 'alto' | null;
  descripcionLibre: string;
};

export type ResultadoInvestigarMercado = {
  disponible: true;
  zona: string;
  sinResultadosFiables: boolean;
  motivoSinResultados: string | null;
  candidatos: CandidatoMercado[];
  /** `true` si esta respuesta viene de una investigación reciente reutilizada — el frontend puede avisarlo, nunca oculta que no es "en vivo". */
  desdeCache: boolean;
  creado: string;
};

/** Se lanza cuando la empresa no tiene ubicación configurada — mismo requisito que ya exige el formulario manual (`referencias-mercado-vista.tsx`). */
export class ErrorSinUbicacionEmpresa extends Error {
  constructor() {
    super('Configura primero la ubicación de tu empresa en Ajustes de empresa.');
  }
}

/** Mismo criterio que `resolverZonaLocal`/`zonaParaNivel` (frontend, `mercado-local.ts`/`referencias-mercado-vista.tsx`): la isla manda sobre la provincia en el nivel local; si se cambia ese criterio hay que cambiarlo en los tres sitios. */
function resolverZona(nivel: ParametrosInvestigarMercado['nivelGeografico'], empresa: { comunidadAutonoma: string; provincia: string; isla: string }): string | null {
  if (nivel === 'nacional') return 'España';
  if (nivel === 'regional') return empresa.comunidadAutonoma || null;
  return empresa.isla || empresa.provincia || null;
}

function hashContexto(texto: string): string {
  return texto ? createHash('sha256').update(texto.trim().toLowerCase()).digest('hex').slice(0, 24) : '';
}

// Rango Unicode de marcas diacríticas combinantes (U+0300–U+036F), construido
// con fromCodePoint (en vez de escribir el rango directamente en el código
// fuente) para que ningún editor/herramienta lo normalice o lo corrompa.
const RANGO_DIACRITICOS = `${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}`;
const DIACRITICOS = new RegExp(`[${RANGO_DIACRITICOS}]`, 'g');

function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();
}

/** Islas de Canarias — un candidato que menciona cualquiera de ellas SÍ cuenta como "de Canarias" aunque no escriba literalmente "Canarias" (nivel regional). */
const ISLAS_CANARIAS = ['tenerife', 'gran canaria', 'fuerteventura', 'lanzarote', 'la palma', 'la gomera', 'el hierro', 'las palmas', 'santa cruz de tenerife'];

/**
 * Defensa en profundidad (encargo, "nunca sustituir Canarias por Madrid en
 * silencio", ver "Brújula de Mercado"): aunque el prompt de búsqueda ya
 * prohíbe salirse de la zona pedida en Local/Regional, un modelo puede no
 * respetarlo — este filtro es la última barrera antes de que el candidato
 * llegue siquiera a mostrarse, y por tanto antes de que pueda guardarse
 * etiquetado con una zona que no le corresponde. `ubicacion: null`
 * (desconocida) nunca se descarta solo por eso — el usuario decide si se
 * fía o no de un candidato sin ubicación explícita.
 */
export function esDeLaZona(ubicacion: string | null, zona: string): boolean {
  if (!ubicacion) return true;
  const u = normalizarTexto(ubicacion);
  const z = normalizarTexto(zona);
  if (u.includes(z) || z.includes(u)) return true;
  if (z === 'canarias' && ISLAS_CANARIAS.some((isla) => u.includes(isla))) return true;
  return false;
}

/**
 * Orquesta una investigación de mercado con IA: resuelve la zona real de la
 * empresa, comprueba la caché de 24h, y si no hay acierto, ejecuta los dos
 * pasos (`buscarEnWeb` + `extraerJsonEstructurado`) y persiste el
 * resultado. Nunca guarda nada en `ReferenciaMercado` — eso solo ocurre
 * cuando el usuario confirma un candidato desde la interfaz (mismo
 * endpoint que el formulario manual, `POST /referencias-mercado`).
 */
export async function investigarMercado(params: ParametrosInvestigarMercado): Promise<ResultadoInvestigarMercado> {
  await conectar();

  const empresa = await svc.obtenerEmpresa(params.usuarioId);
  const zona = resolverZona(params.nivelGeografico, empresa);
  if (!zona) throw new ErrorSinUbicacionEmpresa();

  const contextoHash = hashContexto(params.descripcionLibre);

  const cacheHit = await InvestigacionMercadoModel
    .findOne({
      usuarioId: params.usuarioId,
      tipoTrabajo: params.tipoTrabajo,
      zona,
      alcance: params.alcance,
      nivelCalidad: params.nivelCalidad,
      contextoHash,
      exito: true,
      creado: { $gte: new Date(Date.now() - VENTANA_CACHE_MS).toISOString() },
    })
    .sort({ creado: -1 })
    .lean()
    .exec();

  if (cacheHit) {
    return {
      disponible: true,
      zona,
      sinResultadosFiables: !!cacheHit.sinResultadosFiables,
      motivoSinResultados: cacheHit.motivoSinResultados || null,
      candidatos: (cacheHit.candidatos ?? []) as CandidatoMercado[],
      desdeCache: true,
      creado: cacheHit.creado,
    };
  }

  const inicio = Date.now();
  const contexto: ContextoBusquedaMercado = {
    tipoTrabajo: params.tipoTrabajo,
    zona,
    nivelGeografico: params.nivelGeografico,
    alcance: params.alcance,
    nivelCalidad: params.nivelCalidad,
    descripcionLibre: params.descripcionLibre,
  };

  let forma: FormaCandidatosMercado = { sinResultadosFiables: true, motivoSinResultados: null, candidatos: [] };
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let modeloUsado = '';
  let exito = false;
  let errorMsg = '';

  try {
    const busqueda = await buscarEnWeb(construirPromptBusqueda(contexto));
    tokensEntrada += busqueda.tokensEntrada;
    tokensSalida += busqueda.tokensSalida;
    modeloUsado = busqueda.modelo;

    const extraccion = await extraerJsonEstructurado<FormaCandidatosMercado>({
      prompt: construirPromptExtraccion(busqueda.textoGrounded, busqueda.urlsCitadas),
      nombreEsquema: 'candidatos_mercado',
      esquemaJsonSchema: ESQUEMA_CANDIDATOS_MERCADO,
    });
    tokensEntrada += extraccion.tokensEntrada;
    tokensSalida += extraccion.tokensSalida;
    modeloUsado = extraccion.modelo;

    // Defensa en profundidad: aunque `construirPromptExtraccion` ya pide
    // solo URLs de `busqueda.urlsCitadas`, nunca se confía ciegamente en
    // que el modelo lo respetó — cualquier URL que no esté en la lista
    // certificada se descarta a `null` en vez de propagar una posible
    // alucinación (encargo, punto 3: "nunca inventar un dato").
    const urlsValidas = new Set(busqueda.urlsCitadas);
    const candidatosConUrlValidada = (extraccion.datos.candidatos ?? []).map((c) => ({
      ...c,
      url: c.url && urlsValidas.has(c.url) ? c.url : null,
    }));

    // Defensa en profundidad #2 (encargo: "nunca sustituir Canarias por
    // Madrid en silencio"): en Local/Regional, un candidato cuya ubicación
    // no coincide con la zona pedida se descarta ANTES de llegar al
    // usuario — nunca se guarda (ni se muestra) etiquetado con una zona
    // que no le corresponde. En Nacional no aplica: cualquier parte de
    // España es válida por definición.
    const candidatosEnZona = params.nivelGeografico === 'nacional'
      ? candidatosConUrlValidada
      : candidatosConUrlValidada.filter((c) => esDeLaZona(c.ubicacion, zona));
    const excluidosPorZona = candidatosConUrlValidada.length - candidatosEnZona.length;

    forma = {
      sinResultadosFiables: extraccion.datos.sinResultadosFiables || candidatosEnZona.length === 0,
      motivoSinResultados: excluidosPorZona > 0
        ? `${extraccion.datos.motivoSinResultados ? extraccion.datos.motivoSinResultados + ' ' : ''}Se descartaron ${excluidosPorZona} resultado${excluidosPorZona === 1 ? '' : 's'} por no ser realmente de "${zona}".`.trim()
        : extraccion.datos.motivoSinResultados,
      candidatos: candidatosEnZona,
    };
    exito = true;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    throw err; // el llamante (ia-rutas.ts) decide cómo traducirlo a la interfaz — se registra igual antes de relanzar.
  } finally {
    await InvestigacionMercadoModel.create({
      id: randomUUID(),
      usuarioId: params.usuarioId,
      tipoTrabajo: params.tipoTrabajo,
      zona,
      alcance: params.alcance,
      nivelCalidad: params.nivelCalidad,
      contextoHash,
      sinResultadosFiables: forma.sinResultadosFiables,
      motivoSinResultados: forma.motivoSinResultados || '',
      candidatos: forma.candidatos,
      proveedor: 'openai',
      modelo: modeloUsado || 'desconocido',
      tokensEntrada,
      tokensSalida,
      exito,
      error: errorMsg,
      creado: new Date().toISOString(),
    });
    await registrarUsoIA({
      usuarioId: params.usuarioId,
      capacidad: NOMBRE_CAPACIDAD,
      proveedor: 'openai',
      modelo: modeloUsado || 'desconocido',
      tokensEntrada,
      tokensSalida,
      duracionMs: Date.now() - inicio,
      iteracionesHerramientas: 0,
      herramientasLlamadas: ['web_search_preview'],
      exito,
      error: errorMsg || undefined,
    });
  }

  return {
    disponible: true,
    zona,
    sinResultadosFiables: forma.sinResultadosFiables,
    motivoSinResultados: forma.motivoSinResultados,
    candidatos: forma.candidatos,
    desdeCache: false,
    creado: new Date().toISOString(),
  };
}
