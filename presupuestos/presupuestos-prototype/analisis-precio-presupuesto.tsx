import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AnalisisPrecio, ResultadoComparables, TrabajoAnalizado } from './inteligencia-precios.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { calcularMetricasPorTipo } from './metricas-por-tipo.js';
import { evaluarPrecio } from './evaluar-precio.js';
import { ConsejoPrecio } from './consejo-precio.js';
import { resolverMercadoLocal } from './mercado-local.js';
import type { ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';
import { ReferenciasMercadoVista } from './referencias-mercado-vista.js';
import { formatoEuro } from './calculos.js';
import { TrabajosComparables } from './trabajos-comparables.js';
import * as api from './api.js';
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
};

/**
 * 🧠 Análisis de precio — bloque embebido en la revisión de un presupuesto
 * (Inteligencia de Precios, Fase 1). Puramente presentacional: no calcula
 * nada por su cuenta, ni hace ninguna llamada — recibe el resultado ya
 * calculado por `analizarPrecioPresupuesto` (en vivo) o el snapshot
 * guardado (`PresupuestoMC.analisisPrecio`, tras aceptar).
 */
export function AnalisisPrecioPresupuesto({ analisis, esSnapshot, tipoTrabajo, excluirId, proyectoEstado, ubicacionEmpresa }: AnalisisPrecioPresupuestoProps) {
  const [completoAbierto, setCompletoAbierto] = useState(false);

  if (!analisis) {
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
        🧠 Calculando análisis de precio…
      </div>
    );
  }

  if (!analisis.disponible) {
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
        🧠 Datos insuficientes — {interpretarAnalisis(analisis)}
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
export function AnalisisPrecioCompleto({ analisis, tipoTrabajo, excluirId, proyectoEstado, esSnapshot, ubicacionEmpresa, onCerrar }: AnalisisPrecioCompletoProps) {
  const [resultadoComparables, setResultadoComparables] = useState<ResultadoComparables | null>(null);
  const [verMasComparables, setVerMasComparables] = useState(false);
  const [historico, setHistorico] = useState<TrabajoAnalizado[] | null>(null);
  const [referenciasMercado, setReferenciasMercado] = useState<ReferenciaMercado[] | null>(null);
  const ubicacion = ubicacionEmpresa ?? UBICACION_VACIA;

  useEffect(() => {
    if (analisis.disponible === false) return; // sin precio, no hay nada que comparar
    setResultadoComparables(null);
    api.obtenerComparables(analisis.precio, tipoTrabajo, excluirId, verMasComparables ? 10 : 5)
      .then(setResultadoComparables)
      .catch(() => setResultadoComparables({ disponible: false, motivo: 'sin_historico' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis.disponible, analisis.disponible ? analisis.precio : null, tipoTrabajo, excluirId, verMasComparables]);

  useEffect(() => {
    api.analizarInteligenciaPrecios().then(setHistorico).catch(() => setHistorico([]));
  }, []);

  const cargarReferenciasMercado = useCallback(() => {
    api.listarReferenciasMercado().then(setReferenciasMercado).catch(() => setReferenciasMercado([]));
  }, []);
  useEffect(() => { cargarReferenciasMercado(); }, [cargarReferenciasMercado]);

  const metricasGrupo = useMemo(() => {
    if (!historico || !tipoTrabajo) return null;
    return calcularMetricasPorTipo(historico).find((m) => m.tipoTrabajo === tipoTrabajo) ?? null;
  }, [historico, tipoTrabajo]);

  const mercadoLocal = useMemo(
    () => resolverMercadoLocal(ubicacion, referenciasMercado ?? [], tipoTrabajo),
    [ubicacion, referenciasMercado, tipoTrabajo]
  );

  const consejo = useMemo(() => {
    if (historico === null || resultadoComparables === null || referenciasMercado === null) return null; // todavía cargando alguna de las tres piezas
    const comparables = resultadoComparables.disponible ? resultadoComparables.comparables : [];
    return evaluarPrecio(analisis, metricasGrupo, comparables, mercadoLocal, { proyectoEstado: proyectoEstado ?? null, esSnapshot: !!esSnapshot });
  }, [analisis, metricasGrupo, resultadoComparables, historico, referenciasMercado, mercadoLocal, proyectoEstado, esSnapshot]);

  if (analisis.disponible === false) {
    return (
      <div className={styles.overlay} onClick={onCerrar}>
        <div className={styles.modal} style={{ maxWidth: 420, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
          <h2 className={styles.modalTitulo}>🧠 Inteligencia de precios</h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'var(--topo-claro)' }}>{interpretarAnalisis(analisis)}</p>
          <button className={styles.btn} style={{ marginTop: '1.25rem', width: '100%' }} onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    );
  }

  const cfg = COLOR_ESTADO[analisis.estado];
  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 460, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>🧠 Análisis de precio</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.5rem' }}>
          <Pregunta titulo="¿Cuánto me cuesta?" respuesta={formatoEuro(analisis.costeEstimado)} nota="Coste registrado del proyecto vinculado (gastos + horas × tarifa)." />
          <Pregunta titulo="¿Qué margen tengo?" respuesta={`${analisis.margenPorcentaje.toFixed(1)}%`} />
          <Pregunta titulo="¿Cuál es mi margen objetivo?" respuesta={`${analisis.margenObjetivoPorcentaje.toFixed(1)}%`} />
          <div>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              ¿Cómo estoy respecto al mercado?
            </p>
            {mercadoLocal.disponible ? (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.88rem' }}>
                Mercado {mercadoLocal.nivelUsado === 'local' ? 'local' : mercadoLocal.nivelUsado === 'regional' ? 'regional' : 'nacional'} ({mercadoLocal.zona}): {formatoEuro(mercadoLocal.precioMin)} – {formatoEuro(mercadoLocal.precioMax)}
              </p>
            ) : (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.88rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>
                {ubicacion.comunidadAutonoma ? 'Todavía no tienes ninguna referencia de mercado guardada para este tipo de trabajo.' : 'Configura la ubicación de tu empresa en Ajustes de empresa para activar esta sección.'}
              </p>
            )}
            {tipoTrabajo && (
              <ReferenciasMercadoVista
                tipoTrabajo={tipoTrabajo}
                ubicacion={ubicacion}
                referencias={(referenciasMercado ?? []).filter((r) => r.tipoTrabajo === tipoTrabajo)}
                onCambio={cargarReferenciasMercado}
              />
            )}
          </div>
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
            <p style={{ margin: 0, fontWeight: 700, color: cfg.color }}>{cfg.icono} {cfg.etiqueta}</p>
          </div>
        </div>

        <button className={styles.btn} style={{ marginTop: '1.25rem', width: '100%' }} onClick={onCerrar}>Cerrar</button>
      </div>
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
