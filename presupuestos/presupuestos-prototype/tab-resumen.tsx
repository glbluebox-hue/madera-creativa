import type { Proyecto, Factura, Adjunto } from './types.js';
import { formatoEuroPrivado, formatoFecha, formatoTamano } from './calculos.js';
import styles from './styles.module.css';

/** Props de la pestaña "Resumen". */
export type TabResumenProps = {
  proyecto: Proyecto;
  /** Facturas de gasto vinculadas a este proyecto (ya cargadas por la ficha). */
  facturasGasto: Factura[];
  /** Adjuntos del proyecto (cargados aparte — ver api.ts). */
  adjuntos: Adjunto[];
  /** Total de ingresos registrados (de `calcularResumen`). */
  totalIngresos: number;
  /** Modo privacidad activo — oculta los importes (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado: boolean;
  /** Va a la pestaña de Proyectos. */
  onIrAProyecto: () => void;
  /** Va a la pestaña de Notas/Documentos. */
  onIrADocumentos: () => void;
};

type ItemActividad = {
  fecha: string;
  icono: 'factura' | 'cobro' | 'nota';
  titulo: string;
  sub: string;
  importe?: number;
  tipoImporte?: 'ingreso' | 'gasto';
};

/**
 * Pestaña "Resumen": vista rápida del proyecto — foto y nombre del
 * proyecto actual, cifras clave, actividad reciente real (facturas y
 * movimientos, no datos de ejemplo) y los documentos más recientes.
 */
export function TabResumen({ proyecto, facturasGasto, adjuntos, totalIngresos, privado, onIrAProyecto, onIrADocumentos }: TabResumenProps) {
  const pendiente = Math.max(0, (proyecto.presupuesto || 0) - totalIngresos);
  const foto = (proyecto.fotos ?? [])[0];

  const actividad: ItemActividad[] = [
    ...facturasGasto.map((f): ItemActividad => ({
      fecha: f.fecha, icono: 'factura', titulo: 'Factura de gasto', sub: `${f.proveedor || 'Sin proveedor'} — ${f.concepto || ''}`.trim(),
      importe: f.importe, tipoImporte: 'gasto',
    })),
    ...proyecto.movimientos.map((m): ItemActividad => ({
      fecha: m.fecha, icono: 'cobro', titulo: m.tipo === 'ingreso' ? 'Cobro registrado' : 'Gasto registrado', sub: m.concepto || m.categoria,
      importe: m.importe, tipoImporte: m.tipo,
    })),
    ...(proyecto.notas ?? []).map((n): ItemActividad => ({
      fecha: n.fecha, icono: 'nota', titulo: 'Nota añadida', sub: n.texto,
    })),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  const documentos = [...adjuntos].slice(0, 4);

  return (
    <div className={styles.tabPanel}>
      <div className={styles.proyectoActualCard} onClick={onIrAProyecto}>
        {foto ? (
          <img src={foto.url} alt={proyecto.proyecto} className={styles.proyectoActualThumb} />
        ) : (
          <div className={styles.proyectoActualThumb}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          </div>
        )}
        <div className={styles.proyectoActualInfo}>
          <span className={styles.proyectoActualLabel}>Proyecto actual</span>
          <p className={styles.proyectoActualNombre}>{proyecto.proyecto || 'Sin proyecto definido'}</p>
        </div>
        <svg className={styles.proyectoActualChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
      </div>

      <div className={styles.statStrip}>
        <div className={styles.statBox}><div className={styles.statBoxValor}>{formatoEuroPrivado(proyecto.presupuesto || 0, privado)}</div><div className={styles.statBoxLabel}>Presupuesto acordado</div></div>
        <div className={styles.statBox}><div className={styles.statBoxValor}>{facturasGasto.length}</div><div className={styles.statBoxLabel}>Facturas de gasto</div></div>
        <div className={styles.statBox}><div className={styles.statBoxValor}>{formatoEuroPrivado(totalIngresos, privado)}</div><div className={styles.statBoxLabel}>Cobrado</div></div>
        <div className={styles.statBox}><div className={styles.statBoxValor} style={{ color: pendiente > 0 ? 'var(--rojo)' : 'var(--verde)' }}>{formatoEuroPrivado(pendiente, privado)}</div><div className={styles.statBoxLabel}>Pendiente</div></div>
      </div>

      <div className={styles.dashboardCols}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Actividad reciente</h3>
          </div>
          {actividad.length === 0 ? (
            <p className={styles.dashboardVacio}>Todavía no hay actividad registrada en este proyecto.</p>
          ) : (
            actividad.map((a, i) => (
              <div key={i} className={styles.actividadItem}>
                <div className={`${styles.kpiIconoChip} ${a.tipoImporte === 'ingreso' ? styles.kpiIconoChipVerde : a.tipoImporte === 'gasto' ? styles.kpiIconoChipRojo : ''}`} style={{ width: 34, height: 34 }}>
                  {a.icono === 'factura' && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /></svg>}
                  {a.icono === 'cobro' && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>}
                  {a.icono === 'nota' && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg>}
                </div>
                <div className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>{a.titulo}</span>
                  <span className={styles.actividadSub}>{a.sub}</span>
                </div>
                <div className={styles.actividadDerecha}>
                  <span className={styles.actividadFecha}>{formatoFecha(a.fecha)}</span>
                  {a.importe !== undefined && (
                    <span className={a.tipoImporte === 'ingreso' ? styles.valorVerde : styles.valorRojo}>
                      {!privado && a.tipoImporte === 'gasto' ? '-' : ''}{formatoEuroPrivado(a.importe, privado)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Documentos</h3>
            <button className={styles.btnIcono} style={{ color: 'var(--topo-claro)', fontSize: '0.75rem' }} onClick={onIrADocumentos}>Ver todos</button>
          </div>
          {documentos.length === 0 ? (
            <p className={styles.dashboardVacio}>Sin documentos subidos todavía.</p>
          ) : (
            documentos.map((d) => (
              <div key={d.id} className={styles.actividadItem}>
                <div className={styles.kpiIconoChip} style={{ width: 34, height: 34 }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <div className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>{d.nombre}</span>
                  <span className={styles.actividadSub}>{formatoTamano(d.tamano)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
