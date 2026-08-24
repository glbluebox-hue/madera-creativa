/**
 * Tipos TypeScript del Motor Documental de Madera Creativa — espejo
 * exacto de `presupuestos-service/documento-modelo.ts` (Zod, fuente de
 * verdad de la validación). Aquí son tipos planos, sin runtime, mismo
 * patrón que ya usa el resto del frontend (`presupuestos-modelo.ts` frente
 * a `esquemaPresupuestoMC`).
 *
 * Ver `presupuestos/presupuestos-platform/ARQUITECTURA-MOTOR-DOCUMENTAL.md`
 * para el diseño completo.
 */

export type PosicionMC = { x: number; y: number };
export type TamanoMC = { ancho: number; alto: number };

export type OrigenComponenteMC = {
  componenteId: string;
  version: number;
  modo: 'vinculado' | 'independiente';
};

export type RestriccionesElementoMC = {
  soloLectura: boolean;
  visibilidad: 'siempre' | 'soloEdicion' | 'soloImpresion' | 'oculto';
  obligatorio: boolean;
};

/**
 * Envolvente común a todos los elementos — `contenido`/`propiedadesEspecificas`/`estilo`
 * quedan como `Record<string, unknown>` a este nivel a propósito: su forma
 * real depende del `tipo` y la resuelve el componente de render de ese
 * tipo (Incremento 2), nunca este archivo (Regla de Oro 6).
 */
export type ElementoMC = {
  id: string;
  tipo: string;
  posicion: PosicionMC;
  tamano: TamanoMC;
  rotacion: number;
  capa: number;
  grupoId: string | null;
  bloqueado: boolean;
  restricciones: RestriccionesElementoMC;
  opacidad: number;
  origenComponente: OrigenComponenteMC | null;
  /** Referencia a un `EstiloNombradoMC` de `DocumentoMC.estilosGuardados` (Incremento 3) — `null` = solo estilo embebido. */
  estiloNombradoId: string | null;
  contenido: Record<string, unknown>;
  propiedadesEspecificas: Record<string, unknown>;
  estilo: Record<string, unknown>;
};

export type ConfiguracionPaginaMC = {
  ancho: number;
  alto: number;
  orientacion: 'vertical' | 'horizontal';
  margenes: { arriba: number; abajo: number; izquierda: number; derecha: number };
};

export type FondoMC = {
  tipo: 'color' | 'imagen' | 'ninguno';
  color?: string;
  imagenUrl?: string;
  ajuste?: 'cubrir' | 'contener' | 'mosaico';
};

export type ZonaMC = { altura: number; elementos: ElementoMC[] };

export type NumeracionPaginaMC = {
  mostrar: boolean;
  formato: string;
  posicion: 'izquierda' | 'centro' | 'derecha';
};

export type PaginaMC = {
  id: string;
  indice: number;
  nombre: string;
  configuracion: ConfiguracionPaginaMC | null;
  fondo: FondoMC | null;
  encabezado: ZonaMC | 'ninguno' | null;
  pie: ZonaMC | 'ninguno' | null;
  numeracion: NumeracionPaginaMC;
  elementos: ElementoMC[];
};

export type PlantillaOrigenMC = { plantillaId: string; version: number };
export type VariablesDocumentoMC = { claves: Record<string, string> };
export type ConfiguracionImpresionMC = { sangrado: number; escala: number };

/** Sistema de estilos (Incremento 3) — ver documento-modelo.ts del backend para la jerarquía completa. */
export type TemaMC = {
  id: string;
  nombre: string;
  colores: { primario: string; secundario: string; fondo: string; texto: string; textoClaro: string };
  tipografias: { titulos: string; cuerpo: string };
};
export type EstiloNombradoMC = { id: string; nombre: string; valores: Record<string, unknown> };

export type DocumentoMC = {
  id: string;
  schemaVersion: 1;
  documentoBaseId: string | null;
  etiquetaVersion: string | null;
  documentVersion: number;
  plantillaOrigen: PlantillaOrigenMC | null;
  paginas: PaginaMC[];
  configuracionPorDefecto: ConfiguracionPaginaMC;
  fondoPorDefecto: FondoMC;
  encabezadoPorDefecto: ZonaMC | 'ninguno' | null;
  piePorDefecto: ZonaMC | 'ninguno' | null;
  variables: VariablesDocumentoMC;
  configuracionImpresion: ConfiguracionImpresionMC;
  tema: TemaMC | null;
  estilosGuardados: EstiloNombradoMC[];
};

export const TEMA_POR_DEFECTO: TemaMC = {
  id: 'tema-defecto',
  nombre: 'Por defecto',
  colores: { primario: '#51483f', secundario: '#8a6835', fondo: '#ffffff', texto: '#18140f', textoClaro: '#7a7060' },
  tipografias: { titulos: 'Georgia', cuerpo: 'Arial' },
};

/** Tamaño de página A4 a 96dpi — mismo valor que el editor legado. */
export const PAGINA_A4 = { ancho: 794, alto: 1123 };

/**
 * Construye un `DocumentoMC` válido de una sola página en blanco — mismos
 * valores que la función homónima ya usada internamente por
 * `editor-documento.tsx` (que la sintetiza al abrir un `contenidoDocumento`
 * vacío). Se expone aquí, además, para que quien vaya a CREAR un
 * presupuesto (`presupuestos-lista-global.tsx`) pueda partir de un
 * documento real y añadirle elementos (p. ej. el bloque de datos del
 * cliente, 24/08/2026) antes de guardarlo, en vez de depender de que el
 * editor lo complete después de abrirlo.
 */
export function crearDocumentoVacio(generarId: () => string): DocumentoMC {
  return {
    id: generarId(),
    schemaVersion: 1,
    documentoBaseId: null,
    etiquetaVersion: null,
    documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{
      id: generarId(), indice: 0, nombre: '', configuracion: null, fondo: null,
      encabezado: null, pie: null, numeracion: { mostrar: false, formato: 'Página {n} de {total}', posicion: 'centro' }, elementos: [],
    }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 40, abajo: 40, izquierda: 40, derecha: 40 } },
    fondoPorDefecto: { tipo: 'ninguno' },
    encabezadoPorDefecto: null,
    piePorDefecto: null,
    variables: { claves: {} },
    configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null,
    estilosGuardados: [],
  };
}

/** Plantilla (Incremento 4) — ver documento-modelo.ts del backend. */
export type PlantillaMC = {
  id: string;
  nombre: string;
  ambito: 'corporativa' | 'usuario' | 'compartida' | 'ia';
  documentoBase: DocumentoMC;
  creadoEn: string;
  actualizadoEn: string;
};

/** Recurso de la biblioteca compartida (Incremento 5) — ver documento-modelo.ts del backend. */
export type RecursoMC = {
  id: string;
  nombre: string;
  tipo: 'logo' | 'icono' | 'imagen' | 'fondo' | 'sello' | 'otro';
  url: string;
  claveAlmacenamiento: string;
  mimeType: string;
  tamano: number;
  hashContenido: string;
  ambito: 'corporativa' | 'usuario';
  etiquetas: string[];
  creadoEn: string;
};

/** Componente reutilizable (Incremento 6) — ver documento-modelo.ts del backend. */
export type ComponenteMC = {
  id: string;
  nombre: string;
  tipo: 'cabecera' | 'pie' | 'firma' | 'condiciones' | 'bloqueCorporativo' | 'libre';
  elementos: ElementoMC[];
  ambito: 'corporativa' | 'usuario';
  creadoEn: string;
  actualizadoEn: string;
};
