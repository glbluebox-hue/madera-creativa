import { useState } from 'react';
import { calcularAhorroAnual, formatoPrecio, type InfoPlanComercial } from './planes.js';
import type { Periodo } from './selector-periodo.js';
import { AvisoMarcaSketchUp } from './aviso-marca-sketchup.js';
import styles from './styles.module.css';

export type TarjetaPlanProps = {
  info: InfoPlanComercial;
  periodo: Periodo;
  /**
   * Solo PRO lo lleva a `true`. Decisión revisada (08/09/2026, sustituye
   * la de 05/09/2026): pasa de fondo blanco + etiqueta "RECOMENDADO" a
   * fondo oscuro + "EL MÁS ELEGIDO" — mismo tratamiento que la tarjeta
   * Pro de la landing comercial, para que "Elige tu plan" (pantalla tras
   * verificar el email) se vea exactamente igual.
   */
  destacado?: boolean;
  /** Funciones ya incluidas en el/los plan(es) inferior(es) — se listan primero, con el prefijo "Todo Basic, además:"/"Todo Pro, además:". Vacío en Basic. */
  heredaDe?: string;
  /**
   * Notifica la elección hacia fuera (08/09/2026, `/auth/elegir-plan`) —
   * opcional: sin ella, el botón se comporta exactamente igual que antes
   * (solo confirmación local, ver `elegir()`). La usa `PantallaElegirPlan`
   * para guardar de verdad la preferencia en el servidor.
   */
  onElegir?: (plan: InfoPlanComercial['plan'], periodo: Periodo) => void;
};

/**
 * Tarjeta de un plan comercial (05/09/2026). El detalle completo de
 * funciones vive en un ACORDÓN dentro de la propia tarjeta —
 * explícitamente nunca un modal ni una página nueva (encargo §15), así
 * las tres tarjetas siguen visibles y comparables mientras una está
 * expandida.
 *
 * El botón "Elegir…" nunca simula una compra completada (no hay pago real
 * todavía, encargo §16): al pulsarlo solo confirma la elección por
 * pantalla y explica que la contratación llegará pronto. El punto de
 * integración real queda marcado en el comentario de `elegir()` — el día
 * que exista pasarela de pago, esa función es lo único que hay que
 * sustituir (llamar al checkout real en vez de mostrar el aviso).
 */
export function TarjetaPlan({ info, periodo, destacado, heredaDe, onElegir }: TarjetaPlanProps) {
  const [expandido, setExpandido] = useState(false);
  const [elegido, setElegido] = useState(false);
  const idDetalle = `plan-detalle-${info.plan}`;

  const precio = periodo === 'mensual' ? info.precioMensual : info.precioAnual;
  const ahorro = calcularAhorroAnual(info);

  /**
   * Punto de integración de la contratación real (futuro Stripe/checkout,
   * ver deuda técnica en MIGRACION.md) — hoy no existe pasarela de pago,
   * así que esto NUNCA debe pasar a "plan contratado": solo confirma la
   * elección por pantalla (siempre, instantáneo) y, si se indicó
   * `onElegir` (08/09/2026), notifica hacia fuera para guardarla de
   * verdad en el servidor (`/auth/elegir-plan`) — nunca al revés: la
   * confirmación visual no depende de si esa llamada tiene éxito.
   */
  const elegir = () => { setElegido(true); onElegir?.(info.plan, periodo); };

  // Color del texto secundario (lema, /mes, "Todo X además:", aviso de
  // SketchUp, confirmación) — el mismo tono cálido claro que ya usan las
  // bandas oscuras de la landing para su texto secundario, solo en la
  // tarjeta destacada; el resto sigue con --topo-claro de siempre.
  const colorSecundario = destacado ? '#d8cfc2' : 'var(--topo-claro)';
  const colorAcento = destacado ? 'var(--ocre-claro)' : undefined;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.9rem',
        padding: '1.25rem 1.1rem', borderRadius: 'var(--radio-grande)',
        background: destacado ? 'var(--marca-oscura)' : 'var(--fondo-panel)',
        border: destacado ? '2px solid var(--marca-oscura)' : '1px solid var(--borde)',
        boxShadow: destacado ? 'var(--sombra)' : 'var(--sombra-xs)',
        color: destacado ? 'var(--blanco)' : undefined,
        position: 'relative',
      }}
    >
      {destacado && (
        <span style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--topo)', color: 'var(--blanco)', fontSize: '0.68rem', fontWeight: 800,
          letterSpacing: '0.04em', padding: '0.25em 0.9em', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          EL MÁS ELEGIDO
        </span>
      )}

      <div>
        <strong style={{ fontSize: '1.05rem', display: 'block', color: colorAcento }}>{info.nombre}</strong>
        <span style={{ fontSize: '0.8rem', color: colorSecundario }}>{info.lema}</span>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: colorAcento }}>{formatoPrecio(precio)}</span>
          <span style={{ fontSize: '0.78rem', color: colorSecundario }}>/{periodo === 'mensual' ? 'mes' : 'año'}</span>
        </div>
        {periodo === 'anual' && (
          <span style={{ fontSize: '0.74rem', color: destacado ? '#a8d4b6' : 'var(--verde)', fontWeight: 600 }}>
            Ahorras {formatoPrecio(ahorro)} al año
          </span>
        )}
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
        <li style={{ display: 'flex', gap: '0.4rem' }}>
          <IconoCheck acento={destacado} /> {info.almacenamientoGB} GB de almacenamiento
        </li>
        {heredaDe && (
          <li style={{ color: colorSecundario, fontSize: '0.76rem', fontWeight: 600, marginTop: '0.1rem' }}>
            Todo {heredaDe}, además:
          </li>
        )}
        {info.caracteristicasPropias.slice(0, 3).map((c) => (
          <li key={c} style={{ display: 'flex', gap: '0.4rem' }}>
            <IconoCheck acento={destacado} /> {c}
          </li>
        ))}
      </ul>

      {info.caracteristicasPropias.length > 3 && (
        <div>
          <button
            type="button"
            aria-expanded={expandido}
            aria-controls={idDetalle}
            onClick={() => setExpandido((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: colorAcento ?? 'var(--topo)', fontSize: '0.78rem', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            }}
          >
            {expandido ? 'Ocultar funciones' : 'Ver todas las funciones'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandido ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {expandido && (
            <ul id={idDetalle} style={{ margin: '0.6rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
              {info.caracteristicasPropias.slice(3).map((c) => (
                <li key={c} style={{ display: 'flex', gap: '0.4rem' }}>
                  <IconoCheck acento={destacado} /> {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        Aviso de marca de SketchUp/Trimble — decisión definitiva (05/09/2026,
        ver `aviso-marca-sketchup.tsx`): debe aparecer SIEMPRE que la
        tarjeta mencione "SketchUp Desktop" en cualquiera de sus dos
        listas (la resumida o la del acordeón), nunca solo cuando el
        acordeón está expandido — así el texto es visible aunque el
        acordeón siga plegado.
      */}
      {info.plan === 'PRO' && <AvisoMarcaSketchUp colorTexto={colorSecundario} />}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          type="button"
          className={`${styles.btn} ${destacado ? styles.btnPrimario : styles.btnSecundario}`}
          style={destacado ? { background: 'var(--ocre-claro)', color: 'var(--marca-oscura)', borderColor: 'var(--ocre-claro)' } : undefined}
          onClick={elegir}
          disabled={elegido}
        >
          {elegido ? `${info.nombre} seleccionado` : `Elegir ${info.nombre}`}
        </button>
        {elegido && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: colorSecundario }}>
            Has elegido {info.nombre} ({periodo}). La contratación con tarjeta estará disponible muy pronto — te avisaremos.
          </p>
        )}
      </div>
    </div>
  );
}

/** `acento` (08/09/2026): en la tarjeta Pro oscura el check pasa de verde a ocre claro, igual que en la landing — el verde normal no se lee bien sobre ese fondo. */
function IconoCheck({ acento }: { acento?: boolean } = {}) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={acento ? 'var(--ocre-claro)' : 'var(--verde)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
