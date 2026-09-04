import { useState } from 'react';
import type { NivelGeografico, AlcanceTrabajo, NivelCalidad, ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';
import { formatoEuro } from './calculos.js';
import { CandidatosMercadoVista } from './candidatos-mercado-vista.js';
import * as api from './api.js';
import type { Estancia } from './types.js';
import { puedeUsar, SOLO_PREMIUM, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import styles from './styles.module.css';

export type ReferenciasMercadoVistaProps = {
  tipoTrabajo: string;
  ubicacion: UbicacionEmpresa;
  /** Referencias YA guardadas de este tipo de trabajo, para poder borrarlas desde aquí mismo. */
  referencias: ReferenciaMercado[];
  /** Ids de las referencias que, aunque coinciden en tipo/zona, NO se han usado en el cálculo del mercado por no compartir alcance/unidad con el resto (autorización "Ficha Comparable", punto 10) — nunca desaparecen, se marcan. */
  idsNoComparables: string[];
  /** Estancias YA medidas del proyecto (Pizarra de medición) — pasadas tal cual a `CandidatosMercadoVista` para dar contexto real a "Buscar con IA" (30/08/2026). `undefined` en vistas sin proyecto cargado. */
  estancias?: Estancia[];
  /**
   * Plan de la sesión actual (Fase 4, 05/09/2026) — "Buscar con IA"
   * (Investigación de Mercado: `describir-trabajo-mercado` +
   * `POST /ia/mercado/buscar`) exige PREMIUM en el backend desde la Fase 2;
   * antes este botón no reflejaba esa restricción. "+ Añadir referencia de
   * mercado" (manual, sin IA) nunca ha estado gateado y sigue sin estarlo —
   * disponible en cualquier plan.
   */
  plan?: PlanAcceso;
  onCambio: () => void;
};

function zonaParaNivel(nivel: NivelGeografico, ubicacion: UbicacionEmpresa): string | null {
  if (nivel === 'nacional') return 'España';
  if (nivel === 'regional') return ubicacion.comunidadAutonoma || null;
  return ubicacion.isla || ubicacion.provincia || null;
}

export const ETIQUETA_NIVEL: Record<NivelGeografico, string> = { local: 'Local', regional: 'Regional', nacional: 'Nacional' };
export const ETIQUETA_ALCANCE: Record<AlcanceTrabajo, string> = { solo_mobiliario: 'Solo mobiliario', mobiliario_encimera: 'Mobiliario + encimera', reforma_completa: 'Reforma completa' };
export const ETIQUETA_CALIDAD: Record<NivelCalidad, string> = { economico: 'Económico', estandar: 'Estándar', alto: 'Alto' };

/** Exportado para que `candidatos-mercado-vista.tsx` use exactamente los mismos chips visuales — nunca un segundo estilo de selector para la misma elección (alcance/calidad). */
export function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${activo ? styles.btnPrimario : styles.btnSecundario}`}
      style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Añadir/listar/borrar referencias de mercado manuales (Fase 2F, ampliado
 * en "Ficha Comparable") — deliberadamente visual, no un formulario
 * técnico: alcance/calidad se eligen con chips, no con selects de
 * catálogo. La zona nunca se escribe a mano, sale siempre de la
 * ubicación ya configurada en Ajustes de empresa. Nunca scraping, nunca
 * IA — el usuario anota lo que él mismo conoce.
 */
export function ReferenciasMercadoVista({ tipoTrabajo, ubicacion, referencias, idsNoComparables, estancias, plan, onCambio }: ReferenciasMercadoVistaProps) {
  const tienePlanBuscarIA = puedeUsar(plan, SOLO_PREMIUM);
  const [abierto, setAbierto] = useState(false);
  const [iaAbierto, setIaAbierto] = useState(false);
  const [nivel, setNivel] = useState<NivelGeografico>('local');
  const [alcance, setAlcance] = useState<AlcanceTrabajo>('mobiliario_encimera');
  const [obraIncluida, setObraIncluida] = useState(false);
  const [electrodomesticosIncluidos, setElectrodomesticosIncluidos] = useState(false);
  const [nivelCalidad, setNivelCalidad] = useState<NivelCalidad | null>(null);
  const [esDesde, setEsDesde] = useState(false);
  const [impuestosConocidos, setImpuestosConocidos] = useState(false);
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [fuente, setFuente] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const esCocina = tipoTrabajo === 'Cocina';
  const zona = zonaParaNivel(nivel, ubicacion);
  const sinUbicacion = !ubicacion.comunidadAutonoma;

  const guardar = async () => {
    const min = Number(precioMin);
    const max = esDesde ? min : Number(precioMax);
    if (!zona) { setError('Configura primero la ubicación de tu empresa en Ajustes de empresa.'); return; }
    if (!Number.isFinite(min) || min <= 0 || (!esDesde && (!Number.isFinite(max) || max < min))) { setError('Revisa los precios — el máximo no puede ser menor que el mínimo.'); return; }
    setError('');
    setGuardando(true);
    try {
      await api.crearReferenciaMercado({
        tipoTrabajo, nivelGeografico: nivel, zona,
        precioMin: min, precioMax: esDesde ? min : max,
        fuente: fuente.trim(), fecha,
        alcance, obraIncluida, electrodomesticosIncluidos: esCocina ? electrodomesticosIncluidos : null,
        nivelCalidad, unidad: 'total', tamano: null,
        impuestosConocidos, tipoPrecio: esDesde ? 'desde' : 'publicado', origen: 'manual',
      });
      setPrecioMin(''); setPrecioMax(''); setFuente(''); setObraIncluida(false); setElectrodomesticosIncluidos(false); setNivelCalidad(null); setEsDesde(false); setImpuestosConocidos(false);
      setAbierto(false);
      onCambio();
    } catch {
      setError('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    await api.borrarReferenciaMercado(id).catch(() => {});
    onCambio();
  };

  const numNoComparables = referencias.filter((r) => idsNoComparables.includes(r.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {numNoComparables > 0 && (
        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--ocre)', fontStyle: 'italic' }}>
          {numNoComparables} referencia{numNoComparables === 1 ? '' : 's'} de otro alcance o unidad en tu zona — no se {numNoComparables === 1 ? 'ha' : 'han'} usado en el cálculo.
        </p>
      )}
      {referencias.map((r) => {
        const noComparable = idsNoComparables.includes(r.id);
        return (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', padding: '0.35rem 0.6rem', background: 'var(--fondo-panel)', borderRadius: 8, opacity: noComparable ? 0.6 : 1 }}>
            <span>
              {r.origen === 'ia_web' && <span title="Encontrada por búsqueda web con IA, confirmada por ti"> 🤖 Vía IA · </span>}
              <strong>{ETIQUETA_NIVEL[r.nivelGeografico]} · {r.zona}</strong>: {r.tipoPrecio === 'desde' ? `desde ${formatoEuro(r.precioMin)}` : `${formatoEuro(r.precioMin)}–${formatoEuro(r.precioMax)}`}
              {' · '}{ETIQUETA_ALCANCE[r.alcance]}
              {r.nivelCalidad && ` · ${ETIQUETA_CALIDAD[r.nivelCalidad]}`}
              {!r.impuestosConocidos && <span style={{ color: 'var(--topo-claro)' }}> · impuestos desconocidos</span>}
              {noComparable && <span style={{ color: 'var(--ocre)' }}> · no comparable con el resto</span>}
              {r.origen === 'ia_web' && r.fuenteUrl ? (
                <> · <a href={r.fuenteUrl} target="_blank" rel="noopener noreferrer">{r.fuente || 'fuente'} ↗</a></>
              ) : (
                r.fuente && <span style={{ color: 'var(--topo-claro)' }}> · {r.fuente}</span>
              )}
            </span>
            <button type="button" onClick={() => borrar(r.id)} style={{ background: 'none', border: 'none', color: 'var(--topo-claro)', cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0 }}>Borrar</button>
          </div>
        );
      })}

      {iaAbierto && (
        <CandidatosMercadoVista
          tipoTrabajo={tipoTrabajo}
          alcanceInicial={alcance}
          nivelCalidadInicial={nivelCalidad}
          estancias={estancias}
          onGuardado={onCambio}
          onCerrar={() => setIaAbierto(false)}
        />
      )}

      {!abierto && !iaAbierto ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecundario}`}
            style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
            onClick={() => { if (tienePlanBuscarIA) setIaAbierto(true); }}
            disabled={!tienePlanBuscarIA}
            title={tienePlanBuscarIA ? undefined : 'Buscar con IA es una función PREMIUM'}
          >
            🔍 Buscar con IA
          </button>
          {!tienePlanBuscarIA && <CandadoPlan planMinimo="PREMIUM" compacto />}
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }} onClick={() => setAbierto(true)}>
            + Añadir referencia de mercado
          </button>
        </div>
      ) : abierto ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.7rem', border: '1px dashed var(--borde)', borderRadius: 8 }}>
          {sinUbicacion && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)' }}>Configura primero la ubicación de tu empresa en Ajustes de empresa.</p>}

          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Zona</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['local', 'regional', 'nacional'] as NivelGeografico[]).map((n) => (
                <Chip key={n} activo={nivel === n} onClick={() => setNivel(n)}>{ETIQUETA_NIVEL[n]}</Chip>
              ))}
            </div>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: 'var(--topo-claro)' }}>{zona ?? '—'} · {tipoTrabajo}</p>
          </div>

          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>¿Qué incluye?</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(Object.keys(ETIQUETA_ALCANCE) as AlcanceTrabajo[]).map((a) => (
                <Chip key={a} activo={alcance === a} onClick={() => setAlcance(a)}>{ETIQUETA_ALCANCE[a]}</Chip>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={obraIncluida} onChange={(e) => setObraIncluida(e.target.checked)} /> Obra incluida
              </label>
              {esCocina && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={electrodomesticosIncluidos} onChange={(e) => setElectrodomesticosIncluidos(e.target.checked)} /> Electrodomésticos incluidos
                </label>
              )}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Calidad (opcional)</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(Object.keys(ETIQUETA_CALIDAD) as NivelCalidad[]).map((c) => (
                <Chip key={c} activo={nivelCalidad === c} onClick={() => setNivelCalidad(nivelCalidad === c ? null : c)}>{ETIQUETA_CALIDAD[c]}</Chip>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input className={styles.input} type="number" min={0} placeholder={esDesde ? 'Precio "desde"' : 'Precio mínimo'} value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} />
            {!esDesde && <input className={styles.input} type="number" min={0} placeholder="Precio máximo" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={esDesde} onChange={(e) => setEsDesde(e.target.checked)} /> Es un precio "desde", no un rango real
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={impuestosConocidos} onChange={(e) => setImpuestosConocidos(e.target.checked)} /> El precio incluye impuestos (IGIC/IVA)
            </label>
          </div>

          <input className={styles.input} placeholder="Fuente (ej. Habitissimo, competidor visto en Instagram…)" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          <input className={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          {error && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--rojo)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
