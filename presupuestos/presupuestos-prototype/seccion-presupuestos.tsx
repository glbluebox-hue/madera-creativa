import { useState, useEffect } from 'react';
import type { ProyectoResumen } from './api.js';
import * as api from './api.js';
import { formatoEuro } from './calculos.js';
import { formatoFecha } from './calculos.js';
import styles from './styles.module.css';

/** Props de la sección de presupuestos del año. */
export type SeccionPresupuestosProps = {
  onAbrirCliente: (id: string) => void;
};

type Carpeta = 'aceptados' | 'pendientes' | 'rechazados';

/** Iconos de línea por carpeta (Dirección Creativa) — sustituyen a los emoji anteriores. */
function IconoCarpeta({ id, s = 14 }: { id: Carpeta; s?: number }) {
  if (id === 'aceptados') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
  if (id === 'pendientes') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

const CARPETAS: { id: Carpeta; label: string; color: string; bg: string }[] = [
  { id: 'aceptados', label: 'Aceptados', color: 'var(--verde)', bg: 'var(--verde-bg)' },
  { id: 'pendientes', label: 'Pendientes', color: 'var(--azul)', bg: 'var(--azul-bg)' },
  { id: 'rechazados', label: 'No aceptados', color: 'var(--rojo)', bg: 'var(--rojo-bg)' },
];

/** Clasifica un cliente en su carpeta. */
function carpetaDe(c: ProyectoResumen): Carpeta {
  if (c.estado === 'rechazado') return 'rechazados';
  if (c.estado === 'presupuestado') return 'pendientes';
  return 'aceptados'; // en_curso | finalizado
}

/** Año de creación de un cliente. */
function anioCliente(c: ProyectoResumen): number {
  return new Date(c.creado).getFullYear();
}

/**
 * Sección de presupuestos organizada por carpetas (aceptados / pendientes / rechazados)
 * filtrada por año. Muestra el importe presupuestado de cada cliente y el total por carpeta.
 *
 * Pide su propio resumen ligero de todos los clientes al servidor
 * (Incremento 1.5) en vez de recibir `clientes` completo por props: necesita
 * organizar el conjunto completo por año, no solo la página cargada en la
 * lista principal de clientes.
 */
export function SeccionPresupuestos({ onAbrirCliente }: SeccionPresupuestosProps) {
  const [carpeta, setCarpeta] = useState<Carpeta>('aceptados');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [clientes, setClientes] = useState<ProyectoResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.obtenerResumenProyectos().then(setClientes).finally(() => setCargando(false));
  }, []);

  const aniosDisponibles = [...new Set(clientes.map(anioCliente))].sort((a, b) => b - a);
  if (!aniosDisponibles.includes(anio)) aniosDisponibles.unshift(anio);

  const delAnio = clientes.filter((c) => anioCliente(c) === anio);

  const porCarpeta: Record<Carpeta, ProyectoResumen[]> = {
    aceptados: delAnio.filter((c) => carpetaDe(c) === 'aceptados'),
    pendientes: delAnio.filter((c) => carpetaDe(c) === 'pendientes'),
    rechazados: delAnio.filter((c) => carpetaDe(c) === 'rechazados'),
  };

  const totalCarpeta = (lista: ProyectoResumen[]) => lista.reduce((s, c) => s + (c.presupuesto || 0), 0);
  const totalAceptados = totalCarpeta(porCarpeta.aceptados);
  const totalPendientes = totalCarpeta(porCarpeta.pendientes);
  const totalRechazados = totalCarpeta(porCarpeta.rechazados);
  const totalGeneral = totalAceptados + totalPendientes;

  const tasaExito = delAnio.length > 0
    ? Math.round((porCarpeta.aceptados.length / (delAnio.length - porCarpeta.pendientes.length || 1)) * 100)
    : 0;

  const listaActual = porCarpeta[carpeta];
  const cfg = CARPETAS.find((f) => f.id === carpeta)!;

  if (cargando) {
    return (
      <div className={styles.vacio}>
        <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </div>
        <p>Cargando presupuestos…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Cabecera */}
      <div className={styles.barraSeccion} style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Presupuestos {anio}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
            Organizados por estado · {delAnio.length} presupuesto{delAnio.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <select
          className={styles.select}
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
        >
          {aniosDisponibles.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* KPI resumen del año */}
      <div className={styles.kpiGrid} style={{ marginBottom: '1.75rem' }}>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Aceptados</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(totalAceptados)}</span>
          <span className={styles.kpiSub}>{porCarpeta.aceptados.length} presupuesto{porCarpeta.aceptados.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipAzul} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Pendientes</span>
          </div>
          <span className={styles.kpiValor} style={{ color: 'var(--azul)' }}>{formatoEuro(totalPendientes)}</span>
          <span className={styles.kpiSub}>{porCarpeta.pendientes.length} presupuesto{porCarpeta.pendientes.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>No aceptados</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(totalRechazados)}</span>
          <span className={styles.kpiSub}>{porCarpeta.rechazados.length} presupuesto{porCarpeta.rechazados.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipOcre} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Tasa de éxito</span>
          </div>
          <span className={styles.kpiValor} style={{ color: 'var(--ocre)' }}>{tasaExito}%</span>
          <span className={styles.kpiSub}>Total potencial: {formatoEuro(totalGeneral)}</span>
        </div>
      </div>

      {/* Selector de carpeta */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {CARPETAS.map((f) => (
          <button
            key={f.id}
            className={`${styles.btn} ${carpeta === f.id ? styles.btnPrimario : styles.btnSecundario}`}
            onClick={() => setCarpeta(f.id)}
          >
            <IconoCarpeta id={f.id} /> {f.label}
            <span style={{
              marginLeft: '0.4rem',
              fontSize: '0.7rem',
              background: carpeta === f.id ? 'rgba(255,255,255,0.25)' : f.bg,
              color: carpeta === f.id ? 'var(--blanco)' : f.color,
              borderRadius: 3,
              padding: '0 5px',
              fontWeight: 700,
            }}>
              {porCarpeta[f.id].length}
            </span>
          </button>
        ))}
      </div>

      {/* Lista de la carpeta seleccionada */}
      {listaActual.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center', color: cfg.color }}><IconoCarpeta id={cfg.id} s={40} /></div>
          <p>No hay presupuestos en la carpeta «{cfg.label}» para {anio}.</p>
          {carpeta === 'rechazados' && (
            <p style={{ fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
              Marca un presupuesto como "No aceptado" desde su ficha para que aparezca aquí.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Cabecera de columnas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto auto',
            gap: '1rem',
            padding: '0 1rem',
            fontSize: '0.7rem',
            color: 'var(--topo-muy-claro)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 700,
          }}>
            <span>Cliente / Proyecto</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Presupuesto</span>
            <span></span>
          </div>

          {listaActual.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto auto',
                gap: '1rem',
                alignItems: 'center',
                background: 'var(--fondo-panel)',
                border: `1px solid var(--borde)`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 6,
                padding: '1rem',
                cursor: 'pointer',
                transition: 'box-shadow 0.15s',
              }}
              onClick={() => onAbrirCliente(c.id)}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--negro)' }}>{c.nombre}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{c.proyecto || 'Sin proyecto'}</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                  {formatoFecha(c.creado)}
                </p>
              </div>
              <div>
                <span style={{
                  display: 'inline-block',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: cfg.bg,
                  color: cfg.color,
                  padding: '3px 10px',
                  borderRadius: 3,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  <IconoCarpeta id={cfg.id} s={11} /> {cfg.label}
                </span>
                {c.estado === 'finalizado' && (
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--verde)', marginTop: 4 }}>Finalizado</span>
                )}
                {c.estado === 'en_curso' && (
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--azul)', marginTop: 4 }}>En curso</span>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: cfg.color, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {formatoEuro(c.presupuesto || 0)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--topo-muy-claro)', display: 'flex' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
            </div>
          ))}

          {/* Total de la carpeta */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0.75rem 1rem',
            background: cfg.bg,
            borderRadius: 6,
            gap: '0.5rem',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.82rem', color: cfg.color, fontWeight: 600 }}>
              Total {cfg.label}:
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: cfg.color }}>
              {formatoEuro(totalCarpeta(listaActual))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


