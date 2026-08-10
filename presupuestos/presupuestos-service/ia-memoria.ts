/**
 * Memoria persistente de IA — hechos/preferencias/decisiones que la IA
 * puede reutilizar entre conversaciones, distinta del historial de chat
 * (efímero, vive solo en el estado del frontend) y de `IaUsoModel`
 * (telemetría, no conocimiento).
 *
 * Una sola colección con un campo `ambito` discriminador, en vez de una
 * colección por ámbito (`MemoriaCliente`, `MemoriaUsuario`, ...): crear una
 * colección `MemoriaProyecto` propia daría por sentada una entidad
 * "Proyecto" que hoy no existe en el modelo de datos (`Cliente.proyecto` es
 * solo texto) — `ambito:'proyecto'` queda reservado en el tipo, listo para
 * cuando exista, sin tener que migrar nada.
 */

/** `'sesion'`/`'proyecto'` reservados: sin lector/escritor real en esta fase. */
export type AmbitoMemoria = 'usuario' | 'cliente' | 'sesion' | 'proyecto';

export type TipoMemoria = 'preferencia' | 'hecho' | 'decision' | 'aprendizaje';

export type MemoriaEntrada = {
  id: string;
  usuarioId: string;
  ambito: AmbitoMemoria;
  /** Vacío si `ambito === 'usuario'` — no hay entidad a la que asociarla. */
  entidadId: string;
  tipo: TipoMemoria;
  /** Clave opcional para upsert (p. ej. `'estilo-redaccion'`) — dos entradas con la misma clave se fusionan en vez de duplicarse. */
  clave?: string;
  contenido: string;
  capacidadOrigen: string;
  origen: 'ia' | 'usuario';
  vecesUsado: number;
  ultimoUso?: string;
  creado: string;
  actualizado: string;
};

/**
 * Contrato de recuperación de memoria — aislado de su implementación
 * (`ia-memoria-servicio.ts`, consulta directa por ámbito+entidad) para
 * poder pasar a una búsqueda semántica/por embeddings en el futuro sin
 * tocar a quien la consume (`ConstructorContexto` de una capacidad).
 */
export interface RecuperadorMemoria {
  recuperar(params: {
    usuarioId: string;
    ambito: AmbitoMemoria;
    entidadId?: string;
    tipo?: TipoMemoria;
    limite: number;
  }): Promise<MemoriaEntrada[]>;
}
