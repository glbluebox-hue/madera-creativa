import { useState } from 'react';
import type { Modelo3D } from './types.js';
import { formatoFecha } from './calculos.js';
import { formatoTamano } from './modelo-3d-archivo.js';
import { VisorModelo3D } from './visor-modelo-3d.js';
import { BotonSubirModelo3D } from './boton-subir-modelo-3d.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { MensajeFuncionBloqueada } from './candado-plan.js';
import styles from './styles.module.css';

/**
 * Punto de entrada oficial de SketchUp for Web (help.sketchup.com), donde
 * el usuario abre SketchUp Desktop con su propia cuenta/licencia — no hay
 * una URL oficial que abra un proyecto/archivo concreto sin pasar por ahí
 * primero. Madera Creativa Estudio no aloja ni ejecuta SketchUp: este
 * enlace solo lleva al usuario a SU PROPIO SketchUp Desktop.
 */
const URL_SKETCHUP = 'https://app.sketchup.com';

/**
 * Aviso de marca (decisión definitiva, 05/09/2026): "SketchUp" es una
 * marca de Trimble Inc.; Madera Creativa Estudio usa el nombre textual
 * "SketchUp Desktop" únicamente para identificar el software externo al
 * que lleva el enlace — nunca se presenta como integración oficial, socio
 * o patrocinado por Trimble. Debe aparecer escrito directamente junto a
 * CUALQUIER mención de SketchUp Desktop (nunca detrás de un tooltip/hover),
 * en un tamaño auxiliar pero con contraste suficiente para ser legible —
 * nunca escondido ni relegado solo a una página legal general.
 */
const AVISO_MARCA_SKETCHUP = 'SketchUp es una marca de Trimble Inc. Madera Creativa Estudio no está afiliada ni patrocinada por Trimble.';

function AvisoMarcaSketchUp() {
  return (
    <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', lineHeight: 1.4, color: 'var(--topo-claro)' }}>
      {AVISO_MARCA_SKETCHUP}
    </p>
  );
}

export type TarjetaModelo3DProps = {
  /** `null` cuando el proyecto todavía no tiene modelo subido. */
  modelo3D: Modelo3D | null;
  subiendo: boolean;
  desasociando: boolean;
  onReemplazar: (file: File) => void;
  onEliminar: () => void;
  /**
   * Plan de la sesión actual — decisión definitiva (05/09/2026): "Modelo
   * 3D" y "SketchUp Desktop" son función PRO/PREMIUM completa. BASIC no
   * tiene ninguna de las dos (antes solo se gateaba el enlace de
   * SketchUp; subir/ver/reemplazar/eliminar el modelo propio quedaban
   * libres para cualquier plan — ya corregido). El backend es quien
   * realmente impide subir/reemplazar/ver el modelo a una cuenta sin
   * PRO+ (ver `presupuestos-service.app-root.ts`); esto solo evita
   * ofrecer un control que el servidor rechazaría.
   */
  plan?: PlanAcceso;
  /** Bypass administrativo — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
};

/**
 * Bloque "Modelo 3D y SketchUp Desktop" de la ficha de proyecto (Fase
 * "Diseño 3D", 30/08/2026 — cierre de plan 05/09/2026). Sustituye al
 * antiguo par `BotonSubirModelo3D` (siempre visible) + `TarjetaModelo3D`
 * (solo si ya había un modelo) por un ÚNICO componente que decide los
 * tres estados posibles según el plan:
 * - Sin PRO+: tarjeta bloqueada (`MensajeFuncionBloqueada`), ningún
 *   control real — ni botón de subida ni tarjeta del modelo, aunque el
 *   proyecto ya tuviera uno de antes de un downgrade (el backend ya no
 *   envía `modelo3D` a una cuenta sin PRO+, así que este caso no debería
 *   llegar aquí con datos de todas formas — ver comentario en
 *   `GET /proyectos/:id`).
 * - Con PRO+ y sin modelo todavía: solo el botón de subida.
 * - Con PRO+ y modelo ya subido: tarjeta completa (miniatura, tamaño,
 *   fecha, visualizar/descargar/reemplazar/eliminar) + el enlace
 *   "Abrir en SketchUp Desktop ↗" + el aviso de marca, siempre visible
 *   justo debajo, nunca detrás de un tooltip.
 */
export function TarjetaModelo3D({ modelo3D, subiendo, desasociando, onReemplazar, onEliminar, plan, esAdmin }: TarjetaModelo3DProps) {
  const [visorAbierto, setVisorAbierto] = useState(false);
  const tienePlan = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);

  if (!tienePlan) {
    return (
      <div style={{ marginTop: '1rem' }}>
        <MensajeFuncionBloqueada planMinimo="PRO" titulo="Modelo 3D y SketchUp Desktop">
          Disponible en PRO.
        </MensajeFuncionBloqueada>
        <AvisoMarcaSketchUp />
      </div>
    );
  }

  if (!modelo3D) {
    return (
      <div style={{ marginTop: '1rem' }}>
        <BotonSubirModelo3D subiendo={subiendo} onArchivo={onReemplazar} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--fondo-caja)' }}>
      <div
        onClick={() => setVisorAbierto(true)}
        title="Visualizar en 3D"
        style={{ width: 72, height: 72, flexShrink: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden' }}
      >
        {modelo3D.url && <VisorModelo3D src={modelo3D.url} nombreArchivo={modelo3D.nombreArchivo} />}
      </div>

      <div style={{ flex: 1, minWidth: 160 }}>
        <strong style={{ display: 'block', fontSize: '0.88rem' }}>Modelo 3D</strong>
        <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
          {modelo3D.nombreArchivo} · .{modelo3D.formato || 'glb'}
          {typeof modelo3D.tamano === 'number' && ` · ${formatoTamano(modelo3D.tamano)}`}
          {' · actualizado '}{formatoFecha(modelo3D.actualizado)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 220 }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={() => setVisorAbierto(true)}>
            Visualizar en 3D
          </button>
          {modelo3D.url && (
            <a href={modelo3D.url} download={modelo3D.nombreArchivo} className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem', textDecoration: 'none' }}>
              Descargar modelo
            </a>
          )}
          <BotonSubirModelo3D subiendo={subiendo} onArchivo={onReemplazar} reemplazar />
          <button type="button" onClick={onEliminar} disabled={desasociando} style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', fontSize: '0.76rem' }}>
            {desasociando ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>

        {/* "SketchUp Desktop" — solo aparece junto al modelo ya subido, porque sin un modelo asociado no tiene sentido ofrecer el enlace. Nombre textual únicamente (nunca logotipos de SketchUp/Trimble), sin presentarse como integración oficial. */}
        <div>
          <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', marginBottom: '0.2rem' }}>SketchUp Desktop</span>
          <a
            href={URL_SKETCHUP}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnSecundario}`}
            style={{ fontSize: '0.78rem', textDecoration: 'none', display: 'inline-block' }}
          >
            Abrir en SketchUp Desktop ↗
          </a>
          <AvisoMarcaSketchUp />
        </div>
      </div>

      {visorAbierto && modelo3D.url && (
        <div className={styles.overlay} onClick={() => setVisorAbierto(false)}>
          <div className={styles.modal} style={{ maxWidth: 900, width: '92vw', height: '80vh', padding: '1rem', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 className={styles.modalTitulo} style={{ margin: 0 }}>{modelo3D.nombreArchivo}</h2>
              <button type="button" className={styles.btn} onClick={() => setVisorAbierto(false)}>Cerrar</button>
            </div>
            <div style={{ flex: 1 }}>
              <VisorModelo3D src={modelo3D.url} nombreArchivo={modelo3D.nombreArchivo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
