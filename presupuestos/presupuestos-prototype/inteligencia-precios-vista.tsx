import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

export type InteligenciaPreciosVistaProps = {
  empresa: Empresa;
};

/**
 * 🧠 Centro de Inteligencia de Precios (Fase 1) — resumen agregado de los
 * presupuestos ya ACEPTADOS con análisis de precio guardado
 * (`PresupuestoMC.analisisPrecio`, congelado por el servidor al aceptar).
 * Deliberadamente NO recalcula nada en vivo aquí: usar solo el snapshot ya
 * guardado evita tener que cargar el proyecto completo de cada presupuesto
 * de todos los clientes (N+1 peticiones) — ver la especificación aprobada,
 * "no llamada innecesaria".
 *
 * Sin gráficos ni pestañas en esta fase — solo tres bloques simples,
 * a propósito ("no quiero un dashboard sobrecargado").
 */
export function InteligenciaPreciosVista({ empresa }: InteligenciaPreciosVistaProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerTodosLosPresupuestos()
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>;
  if (error) return <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error}</p>;

  const analizados = presupuestos.filter((p) => p.analisisPrecio);

  if (empresa.margenObjetivoPorcentaje === null) {
    return (
      <div className={styles.vacio}>
        <p style={{ fontWeight: 700, margin: '0 0 0.4rem' }}>🧠 Configura tu margen objetivo</p>
        <p>Ajustes de empresa → Margen objetivo (%). Sin él, Inteligencia de Precios no puede comparar tus presupuestos con ningún objetivo.</p>
      </div>
    );
  }

  if (presupuestos.length === 0) {
    return (
      <div className={styles.vacio}>
        <p>Todavía no hay ningún presupuesto. En cuanto aceptes uno vinculado a un proyecto con gastos y horas registradas, aparecerá aquí su análisis.</p>
      </div>
    );
  }

  if (analizados.length === 0) {
    return (
      <div className={styles.vacio}>
        <p style={{ fontWeight: 700, margin: '0 0 0.4rem' }}>🧠 Datos insuficientes</p>
        <p>Todavía no hay ningún presupuesto aceptado con coste y margen calculables. Vincula tus presupuestos a un proyecto con gastos/horas registrados y acéptalos para verlos aquí.</p>
      </div>
    );
  }

  const margenMedio = analizados.reduce((s, p) => s + (p.analisisPrecio!.disponible ? p.analisisPrecio!.margenPorcentaje : 0), 0) / analizados.length;
  const porEncima = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'por_encima').length;
  const cerca = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'cerca').length;
  const porDebajo = analizados.filter((p) => p.analisisPrecio!.disponible && p.analisisPrecio!.estado === 'por_debajo').length;
  const recientes = [...analizados].sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Resumen</h3>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Metrica etiqueta="Presupuestos analizados" valor={String(analizados.length)} />
          <Metrica etiqueta="Margen medio" valor={`${margenMedio.toFixed(1)}%`} />
          <Metrica etiqueta="Margen objetivo" valor={`${empresa.margenObjetivoPorcentaje!.toFixed(1)}%`} />
          <Metrica etiqueta="Por encima del objetivo" valor={String(porEncima)} color="var(--verde)" />
          <Metrica etiqueta="Cerca del objetivo" valor={String(cerca)} color="var(--ocre)" />
          <Metrica etiqueta="Por debajo del objetivo" valor={String(porDebajo)} color="var(--rojo)" />
        </div>
      </section>

      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Comparación con mercado</h3>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          Aún no tenemos referencias de mercado para tu tipo de trabajo — puedes seguir usando tu margen objetivo mientras tanto.
        </p>
      </section>

      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Últimos presupuestos analizados</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recientes.map((p) => {
            const a = p.analisisPrecio!;
            const icono = a.disponible ? (a.estado === 'por_encima' ? '🟢' : a.estado === 'cerca' ? '🟡' : '🔴') : '';
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', padding: '0.35rem 0', borderBottom: '1px solid var(--borde-fino)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</span>
                <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0 }}>
                  <strong>{formatoEuro(p.precioTotal)}</strong>
                  {a.disponible && <span>{a.margenPorcentaje.toFixed(1)}%</span>}
                  <span>{icono}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metrica({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{etiqueta}</p>
      <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', color: color || 'inherit' }}>{valor}</p>
    </div>
  );
}
