import { useState } from 'react';
import type { GastoPeriodico } from './types.js';
import { generarId } from './mock.js';
import { formatoEuro } from './calculos.js';
import * as api from './api.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

export type GastosPeriodicosProps = {
  gastos: GastoPeriodico[];
  onCambio: () => void;
};

const ETIQUETA_TIPO: Record<GastoPeriodico['tipo'], string> = {
  amortizacion: 'Amortización', reta: 'Cuota de autónomos', suministro: 'Suministro (vivienda-taller)', provision: 'Provisión por impago', otro: 'Otro',
};

/**
 * Tabla de amortización simplificada (Orden 27/03/1998, AEAT) — coeficiente
 * máximo y período máximo por categoría. Solo una sugerencia de partida: el
 * usuario puede aplicar cualquier coeficiente igual o menor al máximo, y
 * debe confirmarlo con su asesor. Fuente: auditoría fiscal 11/08/2026.
 */
const TABLA_AMORTIZACION: { categoria: string; coefMax: number; anosMax: number }[] = [
  { categoria: 'Elementos de transporte (vehículos)', coefMax: 16, anosMax: 14 },
  { categoria: 'Maquinaria', coefMax: 12, anosMax: 18 },
  { categoria: 'Útiles y herramientas', coefMax: 30, anosMax: 8 },
  { categoria: 'Mobiliario e instalaciones', coefMax: 10, anosMax: 20 },
  { categoria: 'Equipos informáticos', coefMax: 26, anosMax: 10 },
  { categoria: 'Edificios y construcciones', coefMax: 3, anosMax: 68 },
];

const VACIO = {
  tipo: 'amortizacion' as GastoPeriodico['tipo'],
  descripcion: '', importe: '', periodicidad: 'mensual' as GastoPeriodico['periodicidad'],
  valorAdquisicion: '', categoriaBien: TABLA_AMORTIZACION[0].categoria, coeficiente: String(TABLA_AMORTIZACION[0].coefMax),
  afectacionExclusiva: null as boolean | null, nota: '',
};

/**
 * Gastos periódicos/estimados (Fase Facturas Profesional) — amortizaciones,
 * cuota de autónomos, suministros con uso parcial de vivienda, etc. No son
 * facturas: el usuario introduce el dato que le confirme su asesor, la app
 * solo ayuda a calcular la cuota (p. ej. amortización anual/mensual) y deja
 * constancia de que el origen del dato es una decisión del usuario, no
 * algo que la app haya inferido por su cuenta (ver `afectacionExclusiva`:
 * en IRPF un vehículo no admite un % de afectación intermedio — o exclusivo
 * o no deducible en absoluto, art. 22 RIRPF).
 */
export function GastosPeriodicos({ gastos, onCambio }: GastosPeriodicosProps) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  /** Id del gasto que se está editando, o null si el formulario está creando uno nuevo. */
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const cerrarFormulario = () => { setFormAbierto(false); setForm(VACIO); setEditandoId(null); };
  const abrirFormularioNuevo = () => { setForm(VACIO); setEditandoId(null); setFormAbierto(true); };

  const abrirEdicion = (g: GastoPeriodico) => {
    setForm({
      tipo: g.tipo,
      descripcion: g.descripcion,
      importe: String(g.importe),
      periodicidad: g.periodicidad,
      valorAdquisicion: g.valorAdquisicion !== undefined ? String(g.valorAdquisicion) : '',
      categoriaBien: g.categoriaBien ?? TABLA_AMORTIZACION[0].categoria,
      coeficiente: g.coeficiente !== undefined ? String(g.coeficiente) : String(TABLA_AMORTIZACION[0].coefMax),
      afectacionExclusiva: g.afectacionExclusiva ?? null,
      nota: g.nota ?? '',
    });
    setEditandoId(g.id);
    setFormAbierto(true);
  };

  const categoriaSeleccionada = TABLA_AMORTIZACION.find((c) => c.categoria === form.categoriaBien);

  const cuotaAmortizacionSugerida = () => {
    const valor = parseFloat(form.valorAdquisicion.replace(',', '.'));
    const coef = parseFloat(form.coeficiente.replace(',', '.'));
    if (!valor || !coef) return null;
    const anual = valor * (coef / 100);
    return { anual, mensual: anual / 12 };
  };
  const sugerido = form.tipo === 'amortizacion' ? cuotaAmortizacionSugerida() : null;

  const guardar = async () => {
    if (!form.descripcion.trim() || !form.importe) return;
    setGuardando(true);
    try {
      const original = editandoId ? gastos.find((g) => g.id === editandoId) : undefined;
      const nuevo: GastoPeriodico = {
        id: original?.id ?? generarId(),
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        importe: parseFloat(form.importe.replace(',', '.')) || 0,
        periodicidad: form.periodicidad,
        activo: original?.activo ?? true,
        creado: original?.creado ?? new Date().toISOString(),
        nota: form.nota.trim(),
      };
      if (form.tipo === 'amortizacion') {
        nuevo.valorAdquisicion = parseFloat(form.valorAdquisicion.replace(',', '.')) || undefined;
        nuevo.categoriaBien = form.categoriaBien;
        nuevo.coeficiente = parseFloat(form.coeficiente.replace(',', '.')) || undefined;
      }
      if (form.tipo === 'amortizacion' && form.categoriaBien.startsWith('Elementos de transporte')) {
        nuevo.afectacionExclusiva = form.afectacionExclusiva;
      }
      await api.guardarGastoPeriodico(nuevo);
      cerrarFormulario();
      onCambio();
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (g: GastoPeriodico) => {
    await api.guardarGastoPeriodico({ ...g, activo: !g.activo });
    onCambio();
  };

  const borrar = async (id: string) => {
    await api.borrarGastoPeriodico(id);
    onCambio();
  };

  const esVehiculo = form.tipo === 'amortizacion' && form.categoriaBien.startsWith('Elementos de transporte');
  const puedeGuardar = form.descripcion.trim() && form.importe && (!esVehiculo || form.afectacionExclusiva !== null);

  return (
    <div style={{ border: '1px solid var(--borde)', borderRadius: 10, background: 'var(--fondo-panel)', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: gastos.length || formAbierto ? '0.85rem' : 0 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem' }}>Gastos periódicos / estimados</p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
            Amortizaciones, cuota de autónomos, suministros… gastos deducibles que no llegan como una factura.
          </p>
        </div>
        <button className={styles.btnCirculoOscuro} onClick={() => (formAbierto ? cerrarFormulario() : abrirFormularioNuevo())} title={formAbierto ? 'Cancelar' : 'Añadir gasto periódico'}>
          {formAbierto
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
        </button>
      </div>

      {formAbierto && (
        <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.9rem', marginBottom: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {editandoId && (
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--topo)' }}>Editando gasto periódico</p>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(Object.keys(ETIQUETA_TIPO) as GastoPeriodico['tipo'][]).map((t) => (
              <button key={t} type="button"
                className={`${styles.btn} ${form.tipo === t ? styles.btnPrimario : styles.btnSecundario}`}
                style={{ fontSize: '0.78rem' }}
                onClick={() => setForm((f) => ({ ...f, tipo: t }))}>
                {ETIQUETA_TIPO[t]}
              </button>
            ))}
          </div>

          <input className={styles.input} placeholder="Descripción (ej. Furgoneta Renault Kangoo)" value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />

          {form.tipo === 'amortizacion' && (
            <>
              <label className={styles.label}>Categoría del bien
                <select className={styles.select} value={form.categoriaBien}
                  onChange={(e) => {
                    const cat = TABLA_AMORTIZACION.find((c) => c.categoria === e.target.value);
                    setForm((f) => ({ ...f, categoriaBien: e.target.value, coeficiente: cat ? String(cat.coefMax) : f.coeficiente }));
                  }}>
                  {TABLA_AMORTIZACION.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria}</option>)}
                </select>
              </label>
              {categoriaSeleccionada && (
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                  Tabla AEAT: coeficiente máximo {categoriaSeleccionada.coefMax}% · período máximo {categoriaSeleccionada.anosMax} años. Puedes aplicar uno menor.
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className={styles.label} style={{ flex: 1 }}>Valor de adquisición (€)
                  <input className={styles.input} type="number" value={form.valorAdquisicion} onChange={(e) => setForm((f) => ({ ...f, valorAdquisicion: e.target.value }))} />
                </label>
                <label className={styles.label} style={{ flex: 1 }}>Coeficiente aplicado (%)
                  <input className={styles.input} type="number" value={form.coeficiente} onChange={(e) => setForm((f) => ({ ...f, coeficiente: e.target.value }))} />
                </label>
              </div>
              {sugerido && (
                <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem', alignSelf: 'flex-start' }}
                  onClick={() => setForm((f) => ({ ...f, importe: sugerido.mensual.toFixed(2), periodicidad: 'mensual' }))}>
                  Usar cuota calculada: {formatoEuro(sugerido.anual)}/año ({formatoEuro(sugerido.mensual)}/mes)
                </button>
              )}
              {esVehiculo && (
                <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 6, padding: '0.7rem 0.85rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--ocre)', fontWeight: 700 }}>
                    En IRPF un vehículo no admite un % de afectación intermedio: o exclusivo o no deducible.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className={`${styles.btn} ${form.afectacionExclusiva === true ? styles.btnPrimario : styles.btnSecundario}`} style={{ fontSize: '0.78rem', flex: 1 }}
                      onClick={() => setForm((f) => ({ ...f, afectacionExclusiva: true }))}>Uso exclusivo del negocio</button>
                    <button type="button" className={`${styles.btn} ${form.afectacionExclusiva === false ? styles.btnPeligro : styles.btnSecundario}`} style={{ fontSize: '0.78rem', flex: 1 }}
                      onClick={() => setForm((f) => ({ ...f, afectacionExclusiva: false }))}>También uso particular</button>
                  </div>
                  {form.afectacionExclusiva === false && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--rojo)' }}>No deducible en IRPF — no lo incluyas en el Trimestral.</p>
                  )}
                </div>
              )}
            </>
          )}

          {form.tipo !== 'amortizacion' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label className={styles.label} style={{ flex: 1 }}>Importe (€)
                <input className={styles.input} type="number" value={form.importe} onChange={(e) => setForm((f) => ({ ...f, importe: e.target.value }))} />
              </label>
              <label className={styles.label} style={{ flex: 1 }}>Periodicidad
                <select className={styles.select} value={form.periodicidad} onChange={(e) => setForm((f) => ({ ...f, periodicidad: e.target.value as GastoPeriodico['periodicidad'] }))}>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                </select>
              </label>
            </div>
          )}
          {form.tipo === 'amortizacion' && (
            <label className={styles.label}>Importe mensual a aplicar (€)
              <input className={styles.input} type="number" value={form.importe} onChange={(e) => setForm((f) => ({ ...f, importe: e.target.value, periodicidad: 'mensual' }))} />
            </label>
          )}

          <label className={styles.label}>Nota (opcional — p. ej. "según mi asesor, fecha")
            <input className={styles.input} value={form.nota} onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))} placeholder="según mi asesor, 08/2026" />
          </label>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={!puedeGuardar || guardando} style={{ alignSelf: 'flex-start' }}>
              {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Guardar gasto periódico'}
            </button>
            {editandoId && (
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={cerrarFormulario} style={{ alignSelf: 'flex-start' }}>
                Cancelar
              </button>
            )}
          </div>
          {esVehiculo && form.afectacionExclusiva === null && form.descripcion.trim() && form.importe && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ocre)' }}>
              Elige "Uso exclusivo del negocio" o "También uso particular" arriba para poder guardar.
            </p>
          )}
        </div>
      )}

      {gastos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {gastos.map((g) => (
            <div key={g.id} style={{
              display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.55rem 0.75rem',
              background: g.activo ? 'var(--blanco)' : 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 6,
              opacity: g.activo ? 1 : 0.6, minWidth: 0,
            }}>
              {/* Línea 1: etiqueta + descripción — nunca comparte línea con precio/acciones */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.6rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', flexShrink: 0 }}>{ETIQUETA_TIPO[g.tipo]}</span>
                <div style={{ flex: '1 1 100px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, wordBreak: 'break-word' }}>{g.descripcion}</p>
                  {g.nota && <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--topo-muy-claro)', wordBreak: 'break-word' }}>{g.nota}</p>}
                </div>
              </div>
              {/* Línea 2: precio + acciones — siempre debajo, nunca superpuesta a la descripción */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--rojo)' }}>
                  {formatoEuro(g.importe)}/{g.periodicidad === 'mensual' ? 'mes' : 'trim.'}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.2rem' }}>
                  <button className={styles.btnIcono} title="Editar" aria-label="Editar gasto periódico" onClick={() => abrirEdicion(g)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                  </button>
                  <button className={styles.btnIcono} title={g.activo ? 'Pausar' : 'Reactivar'} onClick={() => alternarActivo(g)}>
                    {g.activo
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>}
                  </button>
                  <ConfirmarBorrado onConfirmar={() => borrar(g.id)} titulo="Eliminar gasto periódico" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
