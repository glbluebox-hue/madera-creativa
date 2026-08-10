import type { ResumenCliente } from './calculos.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

/** Props de la tabla de margen de ganancia. */
export type TablaMargenProps = {
  /** Resumen económico ya calculado del cliente. */
  resumen: ResumenCliente;
  /** Presupuesto acordado con el cliente, para comparar. */
  presupuesto: number;
};

/**
 * Tabla de margen de ganancia: desglosa ingresos, costes (materiales y
 * mano de obra) y calcula el margen final y su porcentaje.
 */
export function TablaMargen({ resumen, presupuesto }: TablaMargenProps) {
  const filas = [
    { concepto: 'Ingresos cobrados', importe: resumen.totalIngresos, tipo: 'positivo' as const },
    { concepto: 'Gastos de materiales', importe: -resumen.totalGastos, tipo: 'negativo' as const },
    { concepto: `Mano de obra (${resumen.totalHoras} h)`, importe: -resumen.costeManoObra, tipo: 'negativo' as const },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
          Margen de ganancia
        </h3>
      </div>

      <div className={styles.tablaWrap}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.concepto}>
                <td>{f.concepto}</td>
                <td
                  style={{ textAlign: 'right' }}
                  className={f.tipo === 'positivo' ? styles.importeIngreso : styles.importeGasto}
                >
                  {f.importe >= 0 ? '+' : '-'}{formatoEuro(Math.abs(f.importe))}
                </td>
              </tr>
            ))}
            <tr className={styles.filaTotal}>
              <td><strong>Coste total</strong></td>
              <td style={{ textAlign: 'right' }} className={styles.importeGasto}>
                <strong>-{formatoEuro(resumen.costeTotal)}</strong>
              </td>
            </tr>
            <tr className={styles.filaMargen}>
              <td>
                <strong>Margen de ganancia</strong>
                <span className={styles.margenPct}>
                  {' '}({resumen.margenPorcentaje.toFixed(1)}% sobre ingresos)
                </span>
              </td>
              <td
                style={{ textAlign: 'right' }}
                className={resumen.margen >= 0 ? styles.valorVerde : styles.valorRojo}
              >
                <strong style={{ fontSize: '1.1rem' }}>
                  {resumen.margen >= 0 ? '+' : '-'}{formatoEuro(Math.abs(resumen.margen))}
                </strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {presupuesto > 0 && (
        <p className={styles.margenNota}>
          Presupuesto acordado: <strong>{formatoEuro(presupuesto)}</strong>
          {' · '}
          {resumen.totalIngresos >= presupuesto
            ? 'Ya has cobrado el total presupuestado.'
            : `Pendiente de cobrar: ${formatoEuro(presupuesto - resumen.totalIngresos)}`}
        </p>
      )}
    </div>
  );
}
