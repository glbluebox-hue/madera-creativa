import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AnalisisPrecio, ResultadoComparables, TrabajoAnalizado } from './inteligencia-precios.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { calcularMetricasPorTipo } from './metricas-por-tipo.js';
import { evaluarPrecio } from './evaluar-precio.js';
import { ConsejoPrecio } from './consejo-precio.js';
import { resolverMercadoLocal } from './mercado-local.js';
import type { ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';
import { ReferenciasMercadoVista, ETIQUETA_ALCANCE } from './referencias-mercado-vista.js';
import { formatoEuro } from './calculos.js';
import { TrabajosComparables } from './trabajos-comparables.js';
import { PreguntaTipoTrabajo } from './pregunta-tipo-trabajo.js';
import * as api from './api.js';
import type { Estancia } from './types.js';
import styles from './styles.module.css';

/** Ubicación "sin configurar" — el bloque de mercado simplemente no se activa, nunca se asume una zona por defecto (Fase 2F). */
const UBICACION_VACIA: UbicacionEmpresa = { comunidadAutonoma: '', provincia: '', isla: '' };

const COLOR_ESTADO: Record<'por_encima' | 'cerca' | 'por_debajo', { color: string; fondo: string; icono: string; etiqueta: string }> = {
  por_encima: { color: 'var(--verde)', fondo: 'var(--verde-bg)', icono: '🟢', etiqueta: 'Por encima del objetivo' },
  cerca: { color: 'var(--ocre)', fondo: 'var(--ocre-bg)', icono: '🟡', etiqueta: 'Cerca del objetivo' },
  por_debajo: { color: 'var(--rojo)', fondo: 'var(--rojo-bg)', icono: '🔴', etiqueta: 'Por debajo del objetivo' },
};

export type AnalisisPrecioPresupuestoProps = {
  /** `undefined` mientras se está calculando (proyecto todavía cargando) — se muestra un estado neutro, nunca "sin datos" prematuro. */
  analisis: AnalisisPrecio | undefined;
  /** `true` si este es el snapshot congelado al aceptar (en vez del cálculo en vivo) — cambia el pie de página. */
  esSnapshot?: boolean;
  /**
   * Tipo de trabajo del proyecto vinculado (Fase 2C, "Trabajos
   * comparables") — solo se pasa donde ya hay un `Proyecto` cargado
   * (`tab-presupuestos-proyecto.tsx`); en otras vistas sin ese contexto
   * simplemente no se activa la sección de comparables.
   */
  tipoTrabajo?: string | null;
  /** Id de trabajo a excluir del histórico al buscar comparables (el propio proyecto), para no compararse consigo mismo. */
  excluirId?: string;
  /**
   * `Proyecto.estado` (Fase 2E, "Consejo de precio", 28/08/2026) — permite
   * distinguir un margen previsto en vivo (o un snapshot congelado) de un
   * proyecto que sigue en obra de uno ya terminado, para no dar la cifra
   * como definitiva cuando todavía puede cambiar. `undefined`/`null` en
   * vistas sin proyecto cargado — el consejero simplemente no añade esa
   * nota, nunca inventa el estado.
   */
  proyectoEstado?: string | null;
  /** Ubicación estructurada de la Empresa (Fase 2F, "Consenso de Precio") — determina qué mercado local investigar. `undefined` en vistas sin ese dato a mano; el bloque de mercado simplemente no se activa. */
  ubicacionEmpresa?: UbicacionEmpresa;
  /** Estancias YA medidas del `Proyecto` (Pizarra de medición) — se pasan hasta `CandidatosMercadoVista` para dar contexto real a "Buscar con IA" (30/08/2026). `undefined` en vistas sin proyecto cargado. */
  estancias?: Estancia[];
  /** Ver `AnalisisPrecioCompletoProps.proyectoId`. */
  proyectoId?: string | null;
};

/**
 * 🧠 Análisis de precio — bloque embebido en la revisión de un presupuesto
 * (Inteligencia de Precios, Fase 1). Puramente presentacional: no calcula
 * nada por su cuenta, ni hace ninguna llamada — recibe el resultado ya
 * calculado por `analizarPrecioPresupuesto` (en vivo) o el snapshot
 * guardado (`PresupuestoMC.analisisPrecio`, tras aceptar).
 */
export function AnalisisPrecioPresupuesto({ analisis, esSnapshot, tipoTrabajo, excluirId, proyectoEstado, ubicacionEmpresa, estancias, proyectoId }: AnalisisPrecioPresupuestoProps) {
  const [completoAbierto, setCompletoAbierto] = useState(false);

  if (!analisis) {
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
        🧠 Calculando análisis de precio…
      </div>
    );
  }

  if (!analisis.disponible) {
    // Corrección 30/08/2026: antes esto era un callejón sin salida — sin
    // coste/margen todavía (p. ej. un presupuesto recién creado, sin
    // gastos/ingresos), no había forma de llegar a "¿Cómo estoy respecto
    // al mercado?"/"Buscar con IA", que no necesitan ese dato en absoluto.
    // Ahora sigue mostrando el aviso, pero deja abrir igualmente el
    // análisis completo (`AnalisisPrecioCompleto` ya sabe mostrar solo la
    // parte de mercado cuando no hay coste/margen disponible).
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>🧠 {interpretarAnalisis(analisis)}</p>
          <button
            className={`${styles.btn} ${styles.btnSecundario}`}
            style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
            onClick={() => setCompletoAbierto(true)}
          >
            Ver mercado / Buscar con IA
          </button>
        </div>
        {completoAbierto && (
          <AnalisisPrecioCompleto
            analisis={analisis}
            tipoTrabajo={tipoTrabajo ?? null}
            excluirId={excluirId}
            proyectoEstado={proyectoEstado ?? null}
            esSnapshot={!!esSnapshot}
            ubicacionEmpresa={ubicacionEmpresa ?? UBICACION_VACIA}
            estancias={estancias}
            proyectoId={proyectoId}
            onCerrar={() => setCompletoAbierto(false)}
          />
        )}
      </div>
    );
  }

  const cfg = COLOR_ESTADO[analisis.estado];

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', borderRadius: 10, background: cfg.fondo, border: `1px solid ${cfg.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: cfg.color }}>
          {cfg.icono} {cfg.etiqueta}
        </p>
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
          onClick={() => setCompletoAbierto(true)}
        >
          Ver análisis completo
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginTop: '0.6rem', fontSize: '0.8rem' }}>
        <span><strong>{formatoEuro(analisis.precio)}</strong> precio</span>
        <span><strong>{formatoEuro(analisis.costeEstimado)}</strong> coste</span>
        <span><strong>{analisis.margenPorcentaje.toFixed(1)}%</strong> margen previsto</span>
        <span><strong>{analisis.margenObjetivoPorcentaje.toFixed(1)}%</strong> objetivo</span>
      </div>

      {esSnapshot && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--topo-claro)' }}>
          Análisis congelado — no se recalcula automáticamente después.
        </p>
      )}

      {completoAbierto && (
        <AnalisisPrecioCompleto
          analisis={analisis}
          tipoTrabajo={tipoTrabajo ?? null}
          excluirId={excluirId}
          proyectoEstado={proyectoEstado ?? null}
          esSnapshot={!!esSnapshot}
          ubicacionEmpresa={ubicacionEmpresa ?? UBICACION_VACIA}
          estancias={estancias}
          proyectoId={proyectoId}
          onCerrar={() => setCompletoAbierto(false)}
        />
      )}
    </div>
  );
}

export type AnalisisPrecioCompletoProps = {
  analisis: AnalisisPrecio;
  tipoTrabajo: string | null;
  excluirId?: string;
  /** Ver `AnalisisPrecioPresupuestoProps.proyectoEstado`. */
  proyectoEstado?: string | null;
  /** `true` si `analisis` es el snapshot congelado de un presupuesto ya aceptado — cambia qué nota de "costes provisionales" construye `evaluarPrecio()`. */
  esSnapshot?: boolean;
  /** Ver `AnalisisPrecioPresupuestoProps.ubicacionEmpresa`. */
  ubicacionEmpresa?: UbicacionEmpresa;
  /** Ver `AnalisisPrecioPresupuestoProps.estancias`. */
  estancias?: Estancia[];
  /**
   * Id real del `Proyecto` vinculado (30/08/2026) — DISTINTO de `excluirId`
   * (que puede ser el id del propio documento cuando no hay proyecto
   * vinculado, ver `editor-documento.tsx`): solo se usa para poder guardar
   * la característica `tipoTrabajo` si todavía no existe (ver más abajo).
   * `null`/`undefined` cuando no hay proyecto real al que guardarla.
   */
  proyectoId?: string | null;
  onCerrar: () => void;
};

/**
 * Modal completo del análisis de precio — exportado (28/08/2026) para
 * poder abrirse también directamente desde el editor de documentos
 * ("🧠 Inteligencia de precios" en la barra superior), sin pasar por la
 * insignia de `AnalisisPrecioPresupuesto` (pensada para una fila de
 * listado, no para una barra de herramientas). Mismo componente, mismo
 * JSX, dos sitios desde donde se puede abrir — nunca una segunda
 * implementación. Acepta también `disponible:false` para poder explicar
 * con claridad por qué no hay análisis en vez de exigir que el llamante
 * nunca lo abra sin datos.
 *
 * Fase 2E (28/08/2026): este componente ahora también orquesta las dos
 * llamadas que necesita el "🧠 Consejo de precio" — comparables (2C) e
 * histórico completo (2B, para calcular las métricas por tipo de 2D) —
 * una sola vez cada una, nunca repetidas: `TrabajosComparables` ya no
 * pide sus propios datos (evita una llamada duplicada a
 * `api.obtenerComparables`), y `calcularMetricasPorTipo`/`evaluarPrecio`
 * son funciones puras que solo ENSAMBLAN lo que 2A-2D ya calculan — cero
 * fórmula nueva, cero llamada a IA.
 */
export function AnalisisPrecioCompleto({ analisis, tipoTrabajo, excluirId, proyectoEstado, esSnapshot, ubicacionEmpresa, estancias, proyectoId, onCerrar }: AnalisisPrecioCompletoProps) {
  const [resultadoComparables, setResultadoComparables] = useState<ResultadoComparables | null>(null);
  const [verMasComparables, setVerMasComparables] = useState(false);
  const [historico, setHistorico] = useState<TrabajoAnalizado[] | null>(null);
  const [referenciasMercado, setReferenciasMercado] = useState<ReferenciaMercado[] | null>(null);
  const ubicacion = ubicacionEmpresa ?? UBICACION_VACIA;

  // Corrección 30/08/2026: `Proyecto.tipoTrabajo` hoy solo se pregunta al
  // marcar el proyecto "Finalizado" (`pregunta-tipo-trabajo.tsx`) — un
  // proyecto todavía en curso (el caso normal mientras se presupuesta)
  // nunca lo tiene, y sin él Mercado Local/"Buscar con IA" quedaban
  // inalcanzables aunque no dependan de nada más. `tipoTrabajoEfectivo`
  // usa el ya guardado si existe, o el que el usuario elija aquí mismo
  // (ver `PreguntaTipoTrabajo` más abajo) sin esperar a que el proyecto
  // termine.
  const [tipoTrabajoElegido, setTipoTrabajoElegido] = useState<string | null>(null);
  const [pidiendoTipoTrabajo, setPidiendoTipoTrabajo] = useState(false);
  const tipoTrabajoEfectivo = tipoTrabajo ?? tipoTrabajoElegido;

  const definirTipoTrabajo = (valor: string) => {
    setPidiendoTipoTrabajo(false);
    setTipoTrabajoElegido(valor); // optimista: se nota al instante, aunque el guardado real tarde un poco
    if (!proyectoId) return;
    // Dato de bajo riesgo (mismo criterio que `ficha-cliente.tsx`, `guardarTipoTrabajo`):
    // si falla el guardado, en el peor caso se vuelve a preguntar la próxima vez.
    api.guardarCaracteristicaProyecto(proyectoId, 'tipoTrabajo', valor).catch(() => {});
  };

  useEffect(() => {
    if (analisis.disponible === false) return; // sin precio, no hay nada que comparar
    setResultadoComparables(null);
    api.obtenerComparables(analisis.precio, tipoTrabajoEfectivo, excluirId, verMasComparables ? 10 : 5)
      .then(setResultadoComparables)
      .catch(() => setResultadoComparables({ disponible: false, motivo: 'sin_historico' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis.disponible, analisis.disponible ? analisis.precio : null, tipoTrabajoEfectivo, excluirId, verMasComparables]);

  useEffect(() => {
    api.analizarInteligenciaPrecios().then(setHistorico).catch(() => setHistorico([]));
  }, []);

  const cargarReferenciasMercado = useCallback(() => {
    api.listarReferenciasMercado().then(setReferenciasMercado).catch(() => setReferenciasMercado([]));
  }, []);
  useEffect(() => { cargarReferenciasMercado(); }, [cargarReferenciasMercado]);

  const metricasGrupo = useMemo(() => {
    if (!historico || !tipoTrabajoEfectivo) return null;
    return calcularMetricasPorTipo(historico).find((m) => m.tipoTrabajo === tipoTrabajoEfectivo) ?? null;
  }, [historico, tipoTrabajoEfectivo]);

  const mercadoLocal = useMemo(
    () => resolverMercadoLocal(ubicacion, referenciasMercado ?? [], tipoTrabajoEfectivo),
    [ubicacion, referenciasMercado, tipoTrabajoEfectivo]
  );

  const consejo = useMemo(() => {
    if (historico === null || resultadoComparables === null || referenciasMercado === null) return null; // todavía cargando alguna de las tres piezas
    const comparables = resultadoComparables.disponible ? resultadoComparables.comparables : [];
    return evaluarPrecio(analisis, metricasGrupo, comparables, mercadoLocal, { proyectoEstado: proyectoEstado ?? null, esSnapshot: !!esSnapshot });
  }, [analisis, metricasGrupo, resultadoComparables, historico, referenciasMercado, mercadoLocal, proyectoEstado, esSnapshot]);

  // "¿Cómo estoy respecto al mercado?" (Mercado Local, ReferenciasMercadoVista/"Buscar
  // con IA") NO depende de tener coste/margen del proyecto — solo de `tipoTrabajo` y la
  // ubicación de la Empresa (`mercadoLocal` se calcula arriba sin usar `analisis` en
  // absoluto). Corrección 30/08/2026: antes, sin gastos/ingresos todavía en el proyecto,
  // TODO el modal desaparecía tras un simple "Datos insuficientes" y esta sección quedaba
  // inalcanzable — impidiendo usar "Buscar con IA" precisamente cuando más falta hace
  // (un presupuesto recién creado, sin nada más que investigar todavía). Ahora solo las
  // partes que sí necesitan coste/margen real (las 3 preguntas de arriba, comparables con
  // trabajos propios, Consenso de Precio y el estado final) se ocultan sin ese dato; el
  // resto se muestra siempre.
  const cfg = analisis.disponible ? COLOR_ESTADO[analisis.estado] : null;
  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 460, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>🧠 {analisis.disponible ? 'Análisis de precio' : 'Inteligencia de precios'}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.5rem' }}>
          {analisis.disponible ? (
            <>
              <Pregunta titulo="¿Cuánto me cuesta?" respuesta={formatoEuro(analisis.costeEstimado)} nota="Coste registrado del proyecto vinculado (gastos + horas × tarifa)." />
              <Pregunta titulo="¿Qué margen tengo?" respuesta={`${analisis.margenPorcentaje.toFixed(1)}%`} />
              <Pregunta titulo="¿Cuál es mi margen objetivo?" respuesta={`${analisis.margenObjetivoPorcentaje.toFixed(1)}%`} />
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--topo-claro)' }}>{interpretarAnalisis(analisis)}</p>
          )}
          <div>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              ¿Cómo estoy respecto al mercado?
            </p>
            {!tipoTrabajoEfectivo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>
                  {proyectoId ? 'Este proyecto todavía no tiene un tipo de trabajo asignado.' : 'Sin proyecto vinculado no se puede consultar el mercado.'}
                </p>
                {proyectoId && (
                  <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => setPidiendoTipoTrabajo(true)}>
                    Indicar tipo de trabajo
                  </button>
                )}
              </div>
            ) : mercadoLocal.disponible ? (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.88rem' }}>
                Mercado {mercadoLocal.nivelUsado === 'local' ? 'local' : mercadoLocal.nivelUsado === 'regional' ? 'regional' : 'nacional'} ({mercadoLocal.zona}), {ETIQUETA_ALCANCE[mercadoLocal.alcance].toLowerCase()}: {formatoEuro(mercadoLocal.precioMin)} – {formatoEuro(mercadoLocal.precioMax)}
              </p>
            ) : (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.88rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>
                {ubicacion.comunidadAutonoma ? 'Todavía no tienes ninguna referencia de mercado guardada para este tipo de trabajo.' : 'Configura la ubicación de tu empresa en Ajustes de empresa para activar esta sección.'}
              </p>
            )}
            {tipoTrabajoEfectivo && (
              <ReferenciasMercadoVista
                tipoTrabajo={tipoTrabajoEfectivo}
                ubicacion={ubicacion}
                referencias={(referenciasMercado ?? []).filter((r) => r.tipoTrabajo === tipoTrabajoEfectivo)}
                idsNoComparables={mercadoLocal.disponible ? mercadoLocal.referenciasNoComparables.map((r) => r.id) : []}
                estancias={estancias}
                onCambio={cargarReferenciasMercado}
              />
            )}
          </div>
          {analisis.disponible && (
            <>
              <div>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  ¿Cómo estoy respecto a mis propios trabajos?
                </p>
                <TrabajosComparables resultado={resultadoComparables} verMas={verMasComparables} onVerMas={() => setVerMasComparables(true)} />
              </div>
              <div>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  🧭 Consenso de precio
                </p>
                <ConsejoPrecio resultado={consejo} />
              </div>
              <div>
                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Estado
                </p>
                <p style={{ margin: 0, fontWeight: 700, color: cfg!.color }}>{cfg!.icono} {cfg!.etiqueta}</p>
              </div>
            </>
          )}
        </div>

        <button className={styles.btn} style={{ marginTop: '1.25rem', width: '100%' }} onClick={onCerrar}>Cerrar</button>
      </div>

      {pidiendoTipoTrabajo && (
        // Envuelto con stopPropagation: sin esto, elegir una opción (o
        // cerrar este sub-modal) burbujea hasta el overlay de ESTE
        // componente y cierra también "Inteligencia de precios" entero.
        <div onClick={(e) => e.stopPropagation()}>
          <PreguntaTipoTrabajo onConfirmar={definirTipoTrabajo} onSaltar={() => setPidiendoTipoTrabajo(false)} />
        </div>
      )}
    </div>
  );
}

function Pregunta({ titulo, respuesta, nota, atenuado }: { titulo: string; respuesta: string; nota?: string; atenuado?: boolean }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {titulo}
      </p>
      <p style={{ margin: 0, fontSize: '0.88rem', color: atenuado ? 'var(--topo-claro)' : 'inherit', fontStyle: atenuado ? 'italic' : 'normal' }}>
        {respuesta}
      </p>
      {nota && <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: 'var(--topo-claro)' }}>{nota}</p>}
    </div>
  );
}
