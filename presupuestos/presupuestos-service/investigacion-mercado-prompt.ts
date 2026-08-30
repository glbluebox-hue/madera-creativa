/**
 * Prompts de "Investigación de Mercado con IA" (30/08/2026) — dos pasos,
 * dos prompts. Mismo criterio que `ia-prompt-extraer-factura.ts`: la
 * regla más repetida en ambos es "no inventes nada, marca lo desconocido
 * como desconocido" (encargo, puntos 3 y 9).
 */

export type ContextoBusquedaMercado = {
  tipoTrabajo: string;
  zona: string;
  nivelGeografico: 'local' | 'regional' | 'nacional';
  alcance: 'solo_mobiliario' | 'mobiliario_encimera' | 'reforma_completa';
  nivelCalidad: 'economico' | 'estandar' | 'alto' | null;
  /** Texto libre best-effort extraído del propio presupuesto (materiales, medidas…) — puede venir vacío, nunca es obligatorio (encargo, punto 2). */
  descripcionLibre: string;
};

const ETIQUETA_ALCANCE: Record<ContextoBusquedaMercado['alcance'], string> = {
  solo_mobiliario: 'solo el mobiliario a medida (sin encimera ni obra)',
  mobiliario_encimera: 'mobiliario a medida más encimera',
  reforma_completa: 'una reforma completa (mobiliario, obra e instalación)',
};

/** Paso 1 — instrucción para la herramienta `web_search_preview` (ver `buscarEnWeb`). */
export function construirPromptBusqueda(ctx: ContextoBusquedaMercado): string {
  const partes = [
    `Eres un investigador de precios de mercado para un carpintero autónomo en España (Madera Creativa) que trabaja con: ${ctx.tipoTrabajo}.`,
    `Busca precios REALES y publicados recientemente de trabajos de "${ctx.tipoTrabajo}" comparables a este:`,
    `- Zona: ${ctx.zona} (nivel ${ctx.nivelGeografico}).`,
    `- Alcance: ${ETIQUETA_ALCANCE[ctx.alcance]}.`,
    ctx.nivelCalidad ? `- Calidad/gama: ${ctx.nivelCalidad}.` : '- Calidad/gama: no especificada, busca en cualquier gama y anótala si la fuente la indica.',
    ctx.descripcionLibre ? `- Detalles adicionales del trabajo (tal como los describió el propio presupuesto): "${ctx.descripcionLibre}".` : '',
    '',
    'Encuentra entre 3 y 5 fuentes DISTINTAS con precios reales publicados (páginas de empresas del sector, guías de precios como Habitissimo/Cronoshare, foros o artículos con cifras concretas, anuncios con precio visible). Para cada una, indica en tu respuesta: el precio o rango exacto, la moneda, la ubicación geográfica de esa referencia, qué incluye y qué NO incluye el precio si se puede saber, la calidad/gama si se menciona, si el precio incluye IVA/IGIC (o se puede deducir), si incluye instalación, la fecha o antigüedad de la publicación, el nombre de la fuente, y cita la URL exacta de cada una.',
    '',
    'REGLAS ESTRICTAS:',
    '- Nunca inventes un precio ni una fuente. Si para un dato concreto (IVA, instalación, calidad, fecha) la fuente no lo dice, dilo explícitamente como "no indicado" — no lo deduzcas ni lo supongas.',
    '- Prioriza fuentes de España y, si es posible, de Canarias/la zona indicada — pero si no encuentras suficientes ahí, dilo y amplía a otras zonas de España, dejando claro de dónde es cada precio.',
    '- Si tras buscar no encuentras al menos 2 fuentes con un precio real y verificable para este tipo de trabajo, dilo explícitamente ("no he encontrado suficientes referencias fiables") en vez de rellenar con precios genéricos o poco fiables.',
    '- Responde en prosa clara, en español, citando cada fuente. No hace falta JSON en este paso.',
  ];
  return partes.filter(Boolean).join('\n');
}

/** JSON Schema (Structured Outputs, modo `strict`) del resultado del paso 2 — ver `extraerJsonEstructurado`. */
export const ESQUEMA_CANDIDATOS_MERCADO = {
  type: 'object',
  properties: {
    sinResultadosFiables: { type: 'boolean' },
    motivoSinResultados: { type: ['string', 'null'] },
    candidatos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          precio: { type: ['number', 'null'] },
          moneda: { type: ['string', 'null'] },
          ubicacion: { type: ['string', 'null'] },
          tipoTrabajoDetectado: { type: ['string', 'null'] },
          queIncluye: { type: ['string', 'null'] },
          queNoIncluye: { type: ['string', 'null'] },
          calidad: { type: ['string', 'null'], enum: ['economico', 'estandar', 'alto', null] },
          ivaIncluido: { type: 'string', enum: ['si', 'no', 'desconocido'] },
          instalacionIncluida: { type: 'string', enum: ['si', 'no', 'desconocido'] },
          fechaReferencia: { type: ['string', 'null'] },
          fuente: { type: ['string', 'null'] },
          url: { type: ['string', 'null'] },
          extracto: { type: ['string', 'null'] },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          explicacionComparabilidad: { type: ['string', 'null'] },
        },
        required: [
          'precio', 'moneda', 'ubicacion', 'tipoTrabajoDetectado', 'queIncluye', 'queNoIncluye',
          'calidad', 'ivaIncluido', 'instalacionIncluida', 'fechaReferencia', 'fuente', 'url',
          'extracto', 'confianza', 'explicacionComparabilidad',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['sinResultadosFiables', 'motivoSinResultados', 'candidatos'],
  additionalProperties: false,
} as const;

/**
 * Paso 2 — convierte el texto grounded del paso 1 en JSON con la forma de
 * `ESQUEMA_CANDIDATOS_MERCADO`. Recibe la lista EXACTA de URLs citadas por
 * OpenAI en el paso 1 (`urlsCitadas`) y exige que el campo `url` de cada
 * candidato sea una de ellas — nunca una URL nueva que el modelo "recuerde"
 * de memoria en este segundo paso, donde ya no tiene acceso a la red.
 */
export function construirPromptExtraccion(textoGrounded: string, urlsCitadas: string[]): string {
  return [
    'A continuación tienes el resultado en prosa de una investigación de precios de mercado, con fuentes citadas.',
    'Tu única tarea es estructurar esa información en JSON, SIN añadir nada que no esté ya en el texto.',
    '',
    '--- TEXTO A ESTRUCTURAR ---',
    textoGrounded || '(vacío — no se encontró nada)',
    '--- FIN DEL TEXTO ---',
    '',
    urlsCitadas.length
      ? `URLs reales verificadas de esta investigación (usa EXACTAMENTE una de estas en el campo "url" de cada candidato que provenga de ella; si un candidato no tiene una URL de esta lista claramente asociada, pon "url": null):\n${urlsCitadas.map((u) => `- ${u}`).join('\n')}`
      : 'No hay URLs verificadas disponibles — pon "url": null en todos los candidatos.',
    '',
    'REGLAS ESTRICTAS:',
    '- Cada campo que el texto no mencione explícitamente debe ir a `null` (o "desconocido" en los campos que solo admiten sí/no/desconocido) — nunca lo deduzcas ni pongas un valor "típico".',
    '- El campo "url" de un candidato NUNCA puede ser una URL que no esté en la lista de arriba.',
    '- Si el texto dice explícitamente que no se encontraron suficientes referencias fiables, pon "sinResultadosFiables": true, explica por qué en "motivoSinResultados", y deja "candidatos": [] — no inventes candidatos para rellenar.',
    '- "confianza" de cada candidato: "alta" solo si el precio, el alcance y la fecha son claros y recientes; "baja" si falta información relevante o la fuente es ambigua; "media" en el resto de casos. Nunca "alta" por defecto.',
  ].join('\n');
}
