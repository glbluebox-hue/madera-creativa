import { useEffect, useState } from 'react';
import { obtenerUsoAlmacenamiento, type UsoAlmacenamiento } from './api.js';

/**
 * Panel "Almacenamiento" (cuota por plan, 05/09/2026) — visualización de
 * cuánto ocupa la cuenta frente al límite de su plan (BASIC 5 GB, PRO
 * 25 GB, PREMIUM 100 GB), con barra de progreso y aviso cerca del límite.
 * Solo lectura: no hay ningún sistema de pago/cambio de plan todavía
 * (petición explícita del usuario) — el mensaje al 100% se limita a
 * explicar las dos salidas reales hoy (liberar espacio borrando archivos,
 * o pedir un cambio de plan al administrador), sin ningún botón que las
 * ejecute.
 *
 * Autónomo: cada instancia hace su propia petición al montar — igual que
 * `AjustesBiometria`/`PanelNotificaciones`, que tampoco reciben sus datos
 * ya cargados desde el componente raíz.
 */

const GIB = 1024 ** 3;

/** `1,8 GB` — coma decimal (convención española del proyecto), un decimal si hace falta, sin decimales para números redondos. */
export function formatoGB(bytes: number): string {
  const gb = bytes / GIB;
  const texto = gb >= 10 || Number.isInteger(gb) ? gb.toFixed(0) : gb.toFixed(1);
  return `${texto.replace('.', ',')} GB`;
}

const COLOR_POR_ESTADO: Record<UsoAlmacenamiento['estado'], { barra: string; texto: string }> = {
  normal: { barra: 'var(--verde)', texto: 'var(--topo-claro)' },
  aviso: { barra: 'var(--ocre)', texto: 'var(--ocre)' },
  lleno: { barra: 'var(--rojo)', texto: 'var(--rojo)' },
};

/**
 * Texto comercial del plan — NUNCA el valor técnico crudo "NONE" (regla
 * explícita, prueba gratuita de 60 días, 05/09/2026): durante el trial se
 * ve "prueba gratuita" (activa o ya terminada), nunca "plan PRO" ni "plan
 * NONE". Fuera del trial, una cuenta sin ningún plan tampoco muestra
 * "NONE" tal cual.
 */
export function etiquetaPlan(uso: UsoAlmacenamiento): string {
  if (uso.tipoAcceso === 'trial') return uso.plan === 'NONE' ? 'prueba gratuita terminada' : 'prueba gratuita';
  return uso.plan === 'NONE' ? 'sin plan asignado' : `plan ${uso.plan}`;
}

export function AlmacenamientoUso() {
  const [uso, setUso] = useState<UsoAlmacenamiento | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    obtenerUsoAlmacenamiento()
      .then((datos) => { if (vivo) setUso(datos); })
      .catch(() => { if (vivo) setError('No se pudo cargar el uso de almacenamiento.'); });
    return () => { vivo = false; };
  }, []);

  if (error) {
    return <p style={{ margin: 0, fontSize: 'var(--texto-sm, 0.75rem)', color: 'var(--topo-claro)' }}>{error}</p>;
  }
  if (!uso) {
    return <p style={{ margin: 0, fontSize: 'var(--texto-sm, 0.75rem)', color: 'var(--topo-claro)' }}>Cargando uso de almacenamiento…</p>;
  }

  if (uso.ilimitado) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--texto-base, 0.84rem)' }}>
          {formatoGB(uso.bytesUsados)} utilizados — cuenta sin límite (administrador)
        </p>
      </div>
    );
  }

  const colores = COLOR_POR_ESTADO[uso.estado];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--texto-base, 0.84rem)' }}>
        {formatoGB(uso.bytesUsados)} de {formatoGB(uso.limiteBytes ?? 0)} utilizados
        <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}> · {etiquetaPlan(uso)}</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={Math.round(uso.porcentaje)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: 8, borderRadius: 999, background: 'var(--borde-fino)', overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%', width: `${Math.min(100, uso.porcentaje)}%`,
            background: colores.barra, borderRadius: 999,
            transition: 'width 0.3s var(--ease-suave, ease)',
          }}
        />
      </div>
      {uso.estado === 'lleno' && (
        <p style={{ margin: 0, fontSize: 'var(--texto-sm, 0.75rem)', color: colores.texto }}>
          Has alcanzado el límite de almacenamiento de tu plan. Libera espacio borrando archivos que ya no necesites, o pide un cambio de plan.
        </p>
      )}
      {uso.estado === 'aviso' && (
        <p style={{ margin: 0, fontSize: 'var(--texto-sm, 0.75rem)', color: colores.texto }}>
          Te estás quedando sin espacio — cuando se llene, no podrás subir archivos nuevos hasta liberar sitio o cambiar de plan.
        </p>
      )}
    </div>
  );
}
