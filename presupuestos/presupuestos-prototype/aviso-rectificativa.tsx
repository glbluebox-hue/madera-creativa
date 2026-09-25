import styles from './styles.module.css';

type AvisoRectificativaProps = {
  advertencias: string[];
  onDescartar: () => void;
};

/**
 * Banner de advertencias de una rectificativa recién guardada (25/09/2026)
 * — `advertenciasRectificativa` es un campo EFÍMERO de la respuesta del
 * guardado (nunca se persiste, ver `guardarFactura()` en el backend): solo
 * se muestra una vez, justo después de guardar. Puramente informativo: no
 * bloquea nada, no crea ninguna complementaria, no toca ninguna fecha, no
 * modifica ningún cálculo ya hecho (ver `detectarRectificativaTrimestreDistinto`
 * en `motor-fiscal.ts`, backend).
 *
 * Compartido entre `Facturas` y `FichaCliente` (25/09/2026, cierre de
 * limitación conocida) — antes solo `Facturas` mostraba este aviso; una
 * rectificativa guardada desde la ficha de cliente/proyecto lo perdía por
 * completo porque ese flujo de guardado descartaba la respuesta del
 * servidor. Con este componente, ambos flujos muestran exactamente el
 * mismo aviso, con el mismo texto y el mismo comportamiento.
 */
export function AvisoRectificativa({ advertencias, onDescartar }: AvisoRectificativaProps) {
  if (advertencias.length === 0) return null;
  return (
    <div style={{
      background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 8,
      padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ocre)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {advertencias.map((texto, i) => (
          <p key={i} style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ocre)' }}>{texto}</p>
        ))}
      </div>
      <button className={styles.btnIcono} onClick={onDescartar} aria-label="Descartar aviso" title="Descartar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}
