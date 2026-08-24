/**
 * Motor de autoguardado — deliberadamente sin ninguna dependencia de React:
 * es una clase de estado puro, testeable con temporizadores simulados sin
 * renderizar nada. `use-autoguardado.ts` es la única pieza que lo conecta a
 * un componente. Fase A del informe de incidencias del editor (23/08/2026):
 * "el presupuesto no puede desaparecer".
 *
 * No sabe nada de `DocumentoMC` ni de presupuestos — solo orquesta CUÁNDO
 * llamar a una función de guardado (`guardar`) que se le pasa desde fuera,
 * reutilizando tal cual el mismo camino que ya usaba el botón "Guardar"
 * manual del editor. No toca deshacer/rehacer en absoluto: solo COMPARA
 * `datos` por referencia contra el último guardado, nunca lo modifica ni
 * conoce `pasado`/`futuro` — guardar nunca puede generar una acción de
 * undo/redo porque este motor no tiene ninguna vía para producir un cambio
 * de documento, solo para leerlo.
 */

/**
 * Estado explícito — nunca un booleano suelto, para no arrastrar el riesgo
 * de que "¿hay cambios?" y "¿se está guardando ahora mismo?" queden
 * desincronizados entre sí.
 *
 * - 'guardado':  los datos actuales coinciden con el último guardado con éxito.
 * - 'pendiente': hay cambios desde ese último guardado, esperando al debounce.
 * - 'guardando': hay una petición de guardado en curso ahora mismo.
 * - 'error':     el último intento falló — sigue habiendo cambios sin
 *                guardar hasta que se reintente con éxito.
 */
export type EstadoAutoguardado = 'guardado' | 'pendiente' | 'guardando' | 'error';

export type OpcionesMotorAutoguardado<T> = {
  guardar: (datos: T) => Promise<void>;
  /** Milisegundos de inactividad antes de disparar el guardado automático. */
  debounceMs?: number;
  /** Se llama cada vez que cambia el estado/error — el hook de React lo usa para reflejarlo en su propio `useState`. */
  onCambioEstado?: (estado: EstadoAutoguardado, errorMensaje: string | null) => void;
};

export class MotorAutoguardado<T> {
  private estado: EstadoAutoguardado = 'guardado';
  private errorMensaje: string | null = null;
  private ultimoGuardado: T;
  private datosActuales: T;
  private promesaEnCurso: Promise<boolean> | null = null;
  private reintentoPendiente = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beforeUnloadActivo = false;
  private readonly guardarFn: (datos: T) => Promise<void>;
  private readonly debounceMs: number;
  private readonly onCambioEstado?: (estado: EstadoAutoguardado, errorMensaje: string | null) => void;

  constructor(datosIniciales: T, opciones: OpcionesMotorAutoguardado<T>) {
    this.ultimoGuardado = datosIniciales;
    this.datosActuales = datosIniciales;
    this.guardarFn = opciones.guardar;
    this.debounceMs = opciones.debounceMs ?? 2500;
    this.onCambioEstado = opciones.onCambioEstado;
  }

  obtenerEstado(): EstadoAutoguardado {
    return this.estado;
  }

  obtenerError(): string | null {
    return this.errorMensaje;
  }

  private readonly alIntentarCerrarPestana = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };

  /** Activa/desactiva el aviso nativo del navegador según haga falta — nunca hace ninguna petición async dentro del propio evento. */
  private sincronizarBeforeUnload(): void {
    const haceFalta = this.estado !== 'guardado';
    if (haceFalta && !this.beforeUnloadActivo) {
      window.addEventListener('beforeunload', this.alIntentarCerrarPestana);
      this.beforeUnloadActivo = true;
    } else if (!haceFalta && this.beforeUnloadActivo) {
      window.removeEventListener('beforeunload', this.alIntentarCerrarPestana);
      this.beforeUnloadActivo = false;
    }
  }

  private establecerEstado(estado: EstadoAutoguardado, errorMensaje: string | null = null): void {
    this.estado = estado;
    this.errorMensaje = errorMensaje;
    this.sincronizarBeforeUnload();
    this.onCambioEstado?.(estado, errorMensaje);
  }

  /**
   * Se llama en cada render/cambio con el valor actual de `datos` —
   * reprograma el debounce SOLO si de verdad cambió por referencia respecto
   * a lo último guardado (nunca dispara una petición por cada llamada).
   */
  actualizarDatos(datos: T): void {
    this.datosActuales = datos;
    if (datos === this.ultimoGuardado) return;
    if (this.estado !== 'guardando') this.establecerEstado('pendiente');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.guardarAhora(); }, this.debounceMs);
  }

  private async realizarGuardado(): Promise<boolean> {
    this.establecerEstado('guardando');
    const datosAEnviar = this.datosActuales;
    try {
      await this.guardarFn(datosAEnviar);
      this.ultimoGuardado = datosAEnviar;
      if (this.reintentoPendiente) {
        // Llegaron cambios mientras se guardaba: repetir con los datos más
        // recientes en vez de darlos por perdidos — nunca un guardado en paralelo.
        this.reintentoPendiente = false;
        return this.realizarGuardado();
      }
      this.establecerEstado(this.datosActuales === this.ultimoGuardado ? 'guardado' : 'pendiente');
      return true;
    } catch (e) {
      // Sin reintento automático en bucle tras un fallo real — queda en
      // 'error' explícito; el siguiente cambio o un `guardarAhora` manual
      // (p. ej. "Volver") es quien vuelve a intentarlo.
      this.reintentoPendiente = false;
      this.establecerEstado('error', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /**
   * Fuerza un guardado inmediato — usado por "Volver" y por el botón
   * manual de "Guardar". Si no hay ningún cambio pendiente, no hace ninguna
   * petición. Si ya hay un guardado en curso, NO lanza uno paralelo: se une
   * al que está en marcha (que se repetirá al terminar si hace falta) en
   * vez de duplicar la llamada de red.
   */
  guardarAhora(): Promise<boolean> {
    if (this.promesaEnCurso) {
      this.reintentoPendiente = true;
      return this.promesaEnCurso;
    }
    if (this.datosActuales === this.ultimoGuardado) {
      return Promise.resolve(true);
    }
    const promesa = this.realizarGuardado().finally(() => { this.promesaEnCurso = null; });
    this.promesaEnCurso = promesa;
    return promesa;
  }

  /** Limpieza al desmontar el editor (o al cambiar de documento) — cancela cualquier debounce pendiente y retira el aviso de cierre, para no dejar timers ni listeners vivos de una sesión anterior. */
  destruir(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.beforeUnloadActivo) {
      window.removeEventListener('beforeunload', this.alIntentarCerrarPestana);
      this.beforeUnloadActivo = false;
    }
  }
}
