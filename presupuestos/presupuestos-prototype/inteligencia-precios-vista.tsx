import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

export type InteligenciaPreciosVistaProps = {
  empresa: Empresa;
};

/**
 * 🧠 Centro de Inteligencia de Precios (Fase 1, ajuste 28/08/2026 —
 * detección automática). Al entrar, pide `api.analizarInteligenciaPrecios()`
 * en vez de la lista genérica de presupuestos: ese endpoint calcula y
 * rellena en el momento el análisis de CUALQUIER presupuesto ya aceptado
 * que todavía no tuviera `analisisPrecio` (el caso real de casi todos los
 * presupuestos aceptados antes de configurar el margen objetivo, o antes
 * de que existiera esta función) — el usuario nunca tiene que "vincular"
 * nada a mano, la relación Presupuesto→Proyecto→gastos/horas ya existía.
 *
 * Sigue sin recalcular en vivo por su cuenta ni hacer peticiones N+1: todo
 * el trabajo de resolver proyectos y calcular ocurre UNA VEZ en el
 * servidor por visita a esta pantalla (ver `svc.analizarPresupuestosAceptados`).
 */
export function InteligenciaPreciosVista({ empresa }: InteligenciaPreciosVistaProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setPresupuestos(null);
    api.analizarInteligenciaPrecios()
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (empresa.margenObjetivoPorcentaje === null) {
    return (
      <div className={styles.vacio}>
        <p style={{ fontWeight: 700, margin: '0 0 0.4rem' }}>🧠 Configura tu margen objetivo</p>
        <p>Ajustes de empresa → Margen objetivo (%). Sin él, Inteligencia de Precios no puede comparar tus presupuestos con ningún objetivo.</p>
      </div>
    );
  }

  if (error) return <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error}</p>;

  if (presupuestos === null) {
    return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>🔎 Analizando tus presupuestos…</p>;
  }

  if (presupuestos.length === 0) {
    return (
      <div className={styles.vacio}>
        <p>Todavía no hay ningún presupuesto aceptado. En cuanto aceptes uno, aparecerá aquí — se analiza automáticamente si su proyecto ya tiene gastos u horas registradas.</p>
      </div>
    );
  }

  const analizados = presupuestos.filter((p) => p.analisisPrecio && p.analisisPrecio.disponible);
  const pendientes = presupuestos.filter((p) => !p.analisisPrecio || !p.analisisPrecio.disponible);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Resumen</h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          <strong>{presupuestos.length}</strong> presupuesto{presupuestos.length !== 1 ? 's' : ''} aceptado{presupuestos.length !== 1 ? 's' : ''} encontrado{presupuestos.length !== 1 ? 's' : ''} ·{' '}
          <strong>{analizados.length}</strong> pueden analizarse ·{' '}
          <strong>{pendientes.length}</strong> necesita{pendientes.length === 1 ? '' : 'n'} más datos de coste
        </p>

        {analizados.length > 0 ? (
          <>
            <ResumenAnalizados analizados={analizados} objetivo={empresa.margenObjetivoPorcentaje} />
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
            Ninguno de tus presupuestos aceptados tiene todavía coste calculable — vincúlalos a un proyecto con gastos u horas registradas para verlos aquí.
          </p>
        )}
      </section>

      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Comparación con mercado</h3>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          Aún no tenemos referencias de mercado para tu tipo de trabajo — puedes seguir usando tu margen objetivo mientras tanto.
        </p>
      </section>

      {analizados.length > 0 && (
        <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Trabajos analizados</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[...analizados].sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).map((p) => {
              const a = p.analisisPrecio!;
              if (!a.disponible) return null;
              const icono = a.estado === 'por_encima' ? '🟢' : a.estado === 'cerca' ? '🟡' : '🔴';
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', padding: '0.35rem 0', borderBottom: '1px solid var(--borde-fino)' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</span>
                  <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0 }}>
                    <strong>{formatoEuro(p.precioTotal)}</strong>
                    <span>{a.margenPorcentaje.toFixed(1)}%</span>
                    <span>{icono}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {pendientes.length > 0 && (
        <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>⚪ Pendientes de datos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendientes.map((p) => (
              <div key={p.id} style={{ fontSize: '0.82rem', padding: '0.35rem 0', borderBottom: '1px solid var(--borde-fino)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>{p.titulo}</span>
                  <strong>{formatoEuro(p.precioTotal)}</strong>
                </div>
                <p style={{ margin: '0.15rem 0 0', color: 'var(--topo-claro)', fontSize: '0.76rem' }}>
                  {p.analisisPrecio ? interpretarAnalisis(p.analisisPrecio) : 'Este presupuesto está aceptado, pero todavía no tiene suficientes datos de coste para calcular su margen.'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResumenAnalizados({ analizados, objetivo }: { analizados: PresupuestoMC[]; objetivo: number }) {
  const margenes = analizados.map((p) => (p.analisisPrecio!.disponible ? p.analisisPrecio!.margenPorcentaje : 0));
  const margenMedio = margenes.reduce((s, m) => s + m, 0) / margenes.length;
  const porEncima = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'por_encima').length;
  const cerca = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'cerca').length;
  const porDebajo = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'por_debajo').length;
  const estadoGeneral = margenMedio >= objetivo ? { icono: '🟢', texto: 'por encima de' } : { icono: '🔴', texto: 'por debajo de' };

  return (
    <>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <Metrica etiqueta="Trabajos analizados" valor={String(analizados.length)} />
        <Metrica etiqueta="Margen medio" valor={`${margenMedio.toFixed(1)}%`} />
        <Metrica etiqueta="Margen objetivo" valor={`${objetivo.toFixed(1)}%`} />
      </div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
        {estadoGeneral.icono} Actualmente estás {estadoGeneral.texto} tu objetivo
      </p>
      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
        <span>🟢 {porEncima} por encima</span>
        <span>🟡 {cerca} cerca</span>
        <span>🔴 {porDebajo} por debajo</span>
      </div>
    </>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{etiqueta}</p>
      <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }}>{valor}</p>
    </div>
  );
}
