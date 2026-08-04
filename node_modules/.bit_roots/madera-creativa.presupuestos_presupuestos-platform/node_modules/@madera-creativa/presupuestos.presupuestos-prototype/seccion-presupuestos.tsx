import { useState } from 'react';
import type { Cliente } from './types.js';
import { formatoEuro } from './calculos.js';
import { formatoFecha } from './calculos.js';
import styles from './styles.module.css';

/** Props de la sección de presupuestos del año. */
export type SeccionPresupuestosProps = {
  clientes: Cliente[];
  onAbrirCliente: (id: string) => void;
};

type Carpeta = 'aceptados' | 'pendientes' | 'rechazados';

const CARPETAS: { id: Carpeta; label: string; emoji: string; color: string; bg: string }[] = [
  { id: 'aceptados', label: 'Aceptados', emoji: '✅', color: 'var(--verde)', bg: 'var(--verde-bg)' },
  { id: 'pendientes', label: 'Pendientes', emoji: '⏳', color: 'var(--azul)', bg: 'var(--azul-bg)' },
  { id: 'rechazados', label: 'No aceptados', emoji: '❌', color: 'var(--rojo)', bg: 'var(--rojo-bg)' },
];

/** Clasifica un cliente en su carpeta. */
function carpetaDe(c: Cliente): Carpeta {
  if (c.estado === 'rechazado') return 'rechazados';
  if (c.estado === 'presupuestado') return 'pendientes';
  return 'aceptados'; // en_curso | finalizado
}

/** Año de creación de un cliente. */
function anioCliente(c: Cliente): number {
  return new Date(c.creado).getFullYear();
}

/**
 * Sección de presupuestos organizada por carpetas (aceptados / pendientes / rechazados)
 * filtrada por año. Muestra el importe presupuestado de cada cliente y el total por carpeta.
 */
export function SeccionPresupuestos({ clientes, onAbrirCliente }: SeccionPresupuestosProps) {
  const [carpeta, setCarpeta] = useState<Carpeta>('aceptados');
  const [anio, setAnio] = useState(new Date().getFullYear());

  const aniosDisponibles = [...new Set(clientes.map(anioCliente))].sort((a, b) => b - a);
  if (!aniosDisponibles.includes(anio)) aniosDisponibles.unshift(anio);

  const delAnio = clientes.filter((c) => anioCliente(c) === anio);

  const porCarpeta: Record<Carpeta, Cliente[]> = {
    aceptados: delAnio.filter((c) => carpetaDe(c) === 'aceptados'),
    pendientes: delAnio.filter((c) => carpetaDe(c) === 'pendientes'),
    rechazados: delAnio.filter((c) => carpetaDe(c) === 'rechazados'),
  };

  const totalCarpeta = (lista: Cliente[]) => lista.reduce((s, c) => s + (c.presupuesto || 0), 0);
  const totalAceptados = totalCarpeta(porCarpeta.aceptados);
  const totalPendientes = totalCarpeta(porCarpeta.pendientes);
  const totalRechazados = totalCarpeta(porCarpeta.rechazados);
  const totalGeneral = totalAceptados + totalPendientes;

  const tasaExito = delAnio.length > 0
    ? Math.round((porCarpeta.aceptados.length / (delAnio.length - porCarpeta.pendientes.length || 1)) * 100)
    : 0;

  const listaActual = porCarpeta[carpeta];
  const cfg = CARPETAS.find((f) => f.id === carpeta)!;

  return (
    <div>
      {/* Cabecera */}
      <div className={styles.barraSeccion} style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className={styles.h2}>📁 Presupuestos {anio}</h2>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--verde)' }}>
          <span className={styles.kpiLabel}>✅ Aceptados</span>
          <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(totalAceptados)}</span>
          <span className={styles.kpiSub}>{porCarpeta.aceptados.length} presupuesto{porCarpeta.aceptados.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--azul)' }}>
          <span className={styles.kpiLabel}>⏳ Pendientes</span>
          <span className={styles.kpiValor} style={{ color: 'var(--azul)' }}>{formatoEuro(totalPendientes)}</span>
          <span className={styles.kpiSub}>{porCarpeta.pendientes.length} presupuesto{porCarpeta.pendientes.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className={styles.kpiLabel}>❌ No aceptados</span>
          <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(totalRechazados)}</span>
          <span className={styles.kpiSub}>{porCarpeta.rechazados.length} presupuesto{porCarpeta.rechazados.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--ocre)', background: 'var(--ocre-bg)' }}>
          <span className={styles.kpiLabel}>📊 Tasa de éxito</span>
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
            {f.emoji} {f.label}
            <span style={{
              marginLeft: '0.4rem',
              fontSize: '0.7rem',
              background: carpeta === f.id ? 'rgba(255,255,255,0.25)' : f.bg,
              color: carpeta === f.id ? '#fff' : f.color,
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
          <div className={styles.vacioIcono}>{cfg.emoji}</div>
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
                  {cfg.emoji} {cfg.label}
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
              <span style={{ fontSize: '0.8rem', color: 'var(--topo-muy-claro)' }}>→</span>
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


