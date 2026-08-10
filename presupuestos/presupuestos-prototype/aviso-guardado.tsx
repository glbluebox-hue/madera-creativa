import { useState, useCallback, useRef } from 'react';

/**
 * Hook para mostrar un aviso temporal de guardado correcto (Incremento
 * 1.8). Extraído del patrón que ya usaba `pizarra-medidas.tsx` (único sitio
 * de la app que daba alguna confirmación visual de guardado) para
 * reutilizarlo donde antes no había ninguna señal de éxito.
 */
export function useAvisoGuardado(duracionMs = 3000) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mostrar = useCallback(() => {
    setVisible(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(false), duracionMs);
  }, [duracionMs]);

  return { visible, mostrar };
}

/** Banner de aviso temporal — mismo estilo visual que ya validó `pizarra-medidas.tsx`. */
export function AvisoGuardado({ visible, mensaje = 'Guardado correctamente' }: { visible: boolean; mensaje?: string }) {
  if (!visible) return null;
  return (
    <div
      style={{
        background: 'var(--verde-bg)', color: 'var(--verde)',
        padding: '0.6rem 0.9rem', borderRadius: 6,
        fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.75rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      {mensaje}
    </div>
  );
}
