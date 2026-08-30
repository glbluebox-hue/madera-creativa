import { useState, useMemo } from 'react';
import type { ProyectoResumen } from './api.js';
import type { NotaMC } from './notas-modelo.js';
import { useCalendario } from './use-calendario.js';
import {
  TIPOS_CALENDARIO, CONFIG_TIPO_CALENDARIO, etiquetaCabecera, desplazar, desdeFechaISO, hoyISO, aFechaISO, rangoParaVista,
} from './calendario-modelo.js';
import type { ElementoCalendario, TipoElementoCalendario, VistaCalendario } from './calendario-modelo.js';
import { CalendarioMes } from './calendario-mes.js';
import { CalendarioSemana } from './calendario-semana.js';
import { CalendarioDia } from './calendario-dia.js';
import { CalendarioCrearModal } from './calendario-crear-modal.js';
import { CalendarioDetalleEventoModal } from './calendario-detalle-evento-modal.js';
import { generarId } from './mock.js';
import * as api from './api.js';
import styles from './styles.module.css';

const VISTAS: { id: VistaCalendario; etiqueta: string }[] = [
  { id: 'mes', etiqueta: 'Mes' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'dia', etiqueta: 'Día' },
];

/**
 * Calendario — capa temporal transversal (30/08/2026). Se llama simplemente
 * "Calendario" en toda la interfaz (nunca "Calendario Inteligente", a
 * petición explícita). Agrega proyectos/tareas/notas/facturas/clientes con
 * fecha relevante + eventos/recordatorios propios; nunca copia datos, ver
 * `calendario-modelo.ts`/`use-calendario.ts`.
 *
 * "Calendario inteligente" (detección de fechas/acciones por IA en texto
 * libre) queda reservado para una fase futura — no implementado aquí
 * (encargo, sección "Calendario inteligente"): la arquitectura no lo
 * bloquea (el modal de creación rápida ya separa "texto libre" de "fecha",
 * el sitio natural donde un día se enchufaría una sugerencia de la IA sin
 * rehacer nada de lo ya construido).
 */
export function CalendarioVista({ proyectos, onAbrirElemento }: {
  proyectos: ProyectoResumen[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
}) {
  const cal = useCalendario();
  const [fechaCreacion, setFechaCreacion] = useState<string | null>(null);
  const [elementoDetalle, setElementoDetalle] = useState<ElementoCalendario | null>(null);
  const hoy = hoyISO();
  const rango = useMemo(() => rangoParaVista(cal.vista, cal.fechaRef), [cal.vista, cal.fechaRef]);

  /** Un evento/recordatorio no tiene otra sección donde "acceder al origen" — se abre aquí mismo; el resto navega (delegado al contenedor de la app). */
  const abrirElemento = (elemento: ElementoCalendario) => {
    if (elemento.tipo === 'evento' || elemento.tipo === 'recordatorio') { setElementoDetalle(elemento); return; }
    onAbrirElemento(elemento);
  };

  const alternarTipo = (t: TipoElementoCalendario) => {
    cal.establecerTipos((prev) => {
      const activos = prev ?? TIPOS_CALENDARIO;
      const yaSolo = activos.length === 1 && activos[0] === t;
      if (yaSolo) return undefined; // Volver a "Todos".
      return [t];
    });
  };
  const filtroActivo: TipoElementoCalendario | 'todos' = !cal.tipos ? 'todos' : (cal.tipos.length === 1 ? cal.tipos[0] : 'todos');

  const guardarNotaRapida = async (contenido: string, fecha: string) => {
    const ahora = new Date().toISOString();
    const nueva: NotaMC = {
      id: generarId(), titulo: '', contenido, tipo: 'nota', items: [], prioridad: 'media', estado: 'abierta',
      clienteId: '', proyectoId: '', etiquetas: [], origen: 'texto', fecha,
      creado: ahora, actualizado: ahora,
    };
    await api.guardarNota(nueva);
    cal.recargar();
  };

  /** El listado ligero de proyectos (`ProyectoResumen`) no trae `tareas` — se pide el proyecto completo justo antes de guardar, para añadir la nueva tarea a las que ya tuviera sin pisarlas. */
  const crearTareaEnProyecto = async (proyectoId: string, texto: string, fecha: string) => {
    const proyectoCompleto = await api.obtenerProyecto(proyectoId);
    const nuevaTarea = { id: generarId(), texto, hecha: false, fecha };
    await api.guardarTareasProyecto(proyectoId, [...(proyectoCompleto.tareas ?? []), nuevaTarea]);
    cal.recargar();
  };

  return (
    <div className={styles.tabPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <h2 className={styles.h2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Calendario
        </h2>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setFechaCreacion(hoy)}>+ Añadir</button>
      </div>

      {/* ── Navegación de fecha + selector de vista ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button className={styles.btnCirculoOscuro} style={{ width: 30, height: 30 }} onClick={() => cal.irA(desplazar(cal.vista, cal.fechaRef, -1))} aria-label="Anterior">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, minWidth: 180, textAlign: 'center' }}>{etiquetaCabecera(cal.vista, cal.fechaRef)}</h3>
          <button className={styles.btnCirculoOscuro} style={{ width: 30, height: 30 }} onClick={() => cal.irA(desplazar(cal.vista, cal.fechaRef, 1))} aria-label="Siguiente">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={cal.irAHoy}>Hoy</button>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {VISTAS.map((v) => (
            <button
              key={v.id}
              className={styles.filtroPill}
              style={cal.vista === v.id ? { background: 'var(--topo)', color: '#fff' } : undefined}
              onClick={() => cal.establecerVista(v.id)}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtros por tipo ── */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button className={styles.filtroPill} style={filtroActivo === 'todos' ? { background: 'var(--topo)', color: '#fff' } : undefined} onClick={() => cal.establecerTipos(undefined)}>
          Todos
        </button>
        {TIPOS_CALENDARIO.map((t) => (
          <button
            key={t}
            className={styles.filtroPill}
            style={filtroActivo === t ? { background: CONFIG_TIPO_CALENDARIO[t].color, color: '#fff' } : undefined}
            onClick={() => alternarTipo(t)}
          >
            {CONFIG_TIPO_CALENDARIO[t].etiquetaFiltro}
          </button>
        ))}
      </div>

      {cal.error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{cal.error}</p>}

      {cal.vista === 'mes' && (
        <CalendarioMes
          desde={rango.desde}
          hasta={rango.hasta}
          hoy={hoy}
          mesActual={cal.fechaRef.getMonth()}
          elementos={cal.elementos}
          onAbrirElemento={abrirElemento}
          onVerDia={(fechaIso) => { cal.irA(desdeFechaISO(fechaIso)); cal.establecerVista('dia'); }}
          onCrearEnFecha={setFechaCreacion}
        />
      )}
      {cal.vista === 'semana' && (
        <CalendarioSemana
          desde={rango.desde}
          hoy={hoy}
          elementos={cal.elementos}
          onAbrirElemento={abrirElemento}
          onCrearEnFecha={setFechaCreacion}
        />
      )}
      {cal.vista === 'dia' && (
        <CalendarioDia
          elementos={cal.elementos}
          onAbrirElemento={abrirElemento}
          onCrear={() => setFechaCreacion(aFechaISO(cal.fechaRef))}
        />
      )}

      {fechaCreacion && (
        <CalendarioCrearModal
          fechaIso={fechaCreacion}
          proyectos={proyectos}
          onGuardarNota={guardarNotaRapida}
          onCrearTarea={crearTareaEnProyecto}
          onCrearEvento={cal.crearEventoCalendario}
          onCerrar={() => setFechaCreacion(null)}
        />
      )}

      {elementoDetalle && (
        <CalendarioDetalleEventoModal
          elemento={elementoDetalle}
          onGuardar={cal.guardarEventoExistente}
          onBorrar={cal.borrarEventoCalendario}
          onCerrar={() => setElementoDetalle(null)}
        />
      )}
    </div>
  );
}
