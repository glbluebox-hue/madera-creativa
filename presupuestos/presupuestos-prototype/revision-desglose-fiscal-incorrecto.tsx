import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { FacturaConProblemaFiscal } from './api.js';
import type { Factura, LineaFiscal, TipoLineaFiscal } from './types.js';
import { agregarLineasFiscales, validarLineasFiscales } from './motor-fiscal.js';
import { imagenesDeFacturaComoBase64 } from './archivos.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import styles from './styles.module.css';

/**
 * Detector — y corrector asistido — de facturas con posible desglose fiscal
 * incorrecto (auditoría 12/09/2026). El análisis inicial es SOLO LECTURA.
 * "Corregir con IA" (petición explícita del usuario, 12/09/2026: "no puedo
 * ponerme a hacer 70 facturas manuales") reextrae con IA cada factura
 * afectada que tenga imagen adjunta, pero NUNCA guarda nada por su cuenta —
 * muestra una comparación (antes/después) y solo aplica lo que el usuario
 * confirma con un único botón al final. Las que la IA no consiga leer con
 * un desglose que cuadre quedan señaladas para revisión manual, nunca se
 * fuerza un dato inventado.
 */

const ETIQUETA_CATEGORIA: Record<string, string> = {
  descuadre_total: 'Descuadre con el importe total',
  datos_fiscales_incompletos: 'Datos fiscales incompletos',
  tipo_exento_con_cuota: 'Exenta/sin impuesto con cuota',
  mezcla_iva_igic: 'Mezcla de IVA e IGIC',
};

const TIPOS_LINEA_VALIDOS: TipoLineaFiscal[] = ['iva', 'igic', 'exento', 'sin_impuesto'];

/** Genera un id único — misma implementación que `escaner-factura.tsx` (no exportada allí). */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type PropuestaCorreccion = {
  id: string;
  proveedor: string;
  concepto: string;
  fecha: string;
  importe: number;
  baseAnterior: number | null;
  cuotaAnterior: number | null;
  estado: 'lista' | 'no_valida' | 'sin_imagen' | 'error';
  mensaje?: string;
  lineasNuevas?: LineaFiscal[];
  baseNueva?: number;
  cuotaNueva?: number;
  facturaOriginal?: Factura;
};

function limpiarJSON(texto: string): string {
  return texto.trim().replace(/^```json\s*|```$/g, '');
}

export function RevisionDesglosefiscalIncorrecto({ onCerrar, onAbrirFactura, onAplicado, plan, esAdmin }: { onCerrar: () => void; onAbrirFactura: (f: Factura) => void; onAplicado: () => void; plan?: PlanAcceso; esAdmin?: boolean }) {
  const tienePlanPro = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ total: number; porCategoria: Record<string, number>; facturas: FacturaConProblemaFiscal[] } | null>(null);
  /** id de la factura que se está abriendo en este momento — para deshabilitar solo su botón mientras carga. */
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  // ── Corrección asistida por IA ──
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaCorreccion[] | null>(null);
  const [avisoLimiteIA, setAvisoLimiteIA] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resumenAplicado, setResumenAplicado] = useState<{ aplicadas: number; fallidas: number } | null>(null);

  // ── Sincronización de tipoImpuesto (bug real detectado 12/09/2026) ──
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<{ corregidas: number; revisadas: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    api.detectarDesglosesFiscalesIncorrectos()
      .then((r) => { if (!cancelado) setResultado(r); })
      .catch(() => { if (!cancelado) setError('No se pudo analizar el desglose fiscal de las facturas.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  /**
   * Resincroniza `tipoImpuesto` con `lineasFiscales` en TODAS las facturas
   * (no solo las de este panel) — corrige el trimestral marcando "impuesto
   * sin identificar" facturas cuyo desglose por tramos ya es correcto.
   * Aplica directamente porque es una resincronización mecánica entre dos
   * campos que ya estaban guardados, no una reextracción ni una decisión
   * nueva sobre la factura.
   */
  const sincronizarTipoImpuesto = async () => {
    if (!tienePlanPro) return;
    setSincronizando(true);
    setError(null);
    try {
      const r = await api.sincronizarTipoImpuesto();
      setResultadoSync(r);
      onAplicado();
    } catch {
      setError('No se pudo sincronizar el tipo de impuesto — inténtalo de nuevo.');
    } finally {
      setSincronizando(false);
    }
  };

  const abrir = async (id: string) => {
    setAbriendoId(id);
    setError(null);
    try {
      const factura = await api.obtenerFactura(id);
      onAbrirFactura(factura);
    } catch {
      setError('No se pudo abrir esa factura — inténtalo de nuevo.');
      setAbriendoId(null);
    }
  };

  /**
   * Reextrae con IA, una a una, cada factura afectada — NUNCA guarda nada
   * aquí, solo propone. Si el límite de peticiones a la IA se agota a
   * mitad de camino, se detiene con un aviso claro en vez de marcar el
   * resto como "error" sin explicación.
   */
  const corregirConIA = async () => {
    if (!resultado || !tienePlanPro) return;
    setCorrigiendo(true);
    setError(null);
    setAvisoLimiteIA(false);
    const lista = resultado.facturas;
    const props: PropuestaCorreccion[] = [];
    setProgreso({ hecho: 0, total: lista.length });

    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];
      const base: Omit<PropuestaCorreccion, 'estado'> = {
        id: item.id, proveedor: item.proveedor, concepto: item.concepto, fecha: item.fecha, importe: item.importe,
        baseAnterior: item.baseUtilizada, cuotaAnterior: item.cuotaUtilizada,
      };
      try {
        const factura = await api.obtenerFactura(item.id);
        const imagenes = await imagenesDeFacturaComoBase64(factura);
        if (imagenes.length === 0) {
          props.push({ ...base, estado: 'sin_imagen', mensaje: 'No tiene ninguna imagen adjunta — no se puede reextraer, hay que corregirla a mano.' });
        } else {
          const resp = await api.generarRespuestaIA({
            capacidad: 'extraer-datos-factura',
            mensajes: [{
              role: 'user',
              content: imagenes.length > 1
                ? `Extrae los datos de esta factura. Se adjuntan las ${imagenes.length} páginas de este mismo documento, en orden.`
                : 'Extrae los datos de esta factura.',
              imagenes,
            }],
          });
          const datos = JSON.parse(limpiarJSON(resp.respuesta));
          const lineasNuevas: LineaFiscal[] = Array.isArray(datos.lineasFiscales)
            ? datos.lineasFiscales
              .filter((l: any) => l && TIPOS_LINEA_VALIDOS.includes(l.tipo) && typeof l.baseImponible === 'number' && typeof l.cuota === 'number')
              .map((l: any) => ({ id: uid(), tipo: l.tipo, porcentaje: typeof l.porcentaje === 'number' ? l.porcentaje : 0, baseImponible: l.baseImponible, cuota: l.cuota }))
            : [];
          if (lineasNuevas.length === 0) {
            props.push({ ...base, estado: 'error', mensaje: 'La IA no ha podido leer un desglose fiscal en este documento.' });
          } else {
            const validacion = validarLineasFiscales(lineasNuevas, factura.importe);
            if (!validacion.valido) {
              props.push({ ...base, estado: 'no_valida', mensaje: validacion.motivo, lineasNuevas });
            } else {
              const agregado = agregarLineasFiscales(lineasNuevas);
              props.push({ ...base, estado: 'lista', lineasNuevas, baseNueva: agregado.baseImponible, cuotaNueva: agregado.importeImpuesto, facturaOriginal: factura });
            }
          }
        }
      } catch (e) {
        if (e instanceof api.ErrorLimiteIA) {
          setAvisoLimiteIA(true);
          setProgreso({ hecho: i, total: lista.length });
          break; // no seguir intentando — el resto queda simplemente sin procesar, no como "error"
        }
        props.push({ ...base, estado: 'error', mensaje: 'No se pudo reextraer esta factura.' });
      }
      setProgreso({ hecho: i + 1, total: lista.length });
    }

    setPropuestas(props);
    setCorrigiendo(false);
  };

  const aplicarCorrecciones = async () => {
    if (!propuestas) return;
    setAplicando(true);
    let aplicadas = 0, fallidas = 0;
    for (const p of propuestas) {
      if (p.estado !== 'lista' || !p.facturaOriginal || !p.lineasNuevas) continue;
      try {
        await api.guardarFactura({ ...p.facturaOriginal, lineasFiscales: p.lineasNuevas, baseImponible: p.baseNueva, importeImpuesto: p.cuotaNueva });
        aplicadas++;
      } catch {
        fallidas++;
      }
    }
    setResumenAplicado({ aplicadas, fallidas });
    setAplicando(false);
    onAplicado();
  };

  const listas = propuestas?.filter((p) => p.estado === 'lista') ?? [];
  const noListas = propuestas?.filter((p) => p.estado !== 'lista') ?? [];

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>Facturas con posible desglose fiscal incorrecto</h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cargando && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Analizando el desglose fiscal de tus facturas…</p>}
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--rojo)' }}>{error}</p>}

          {!cargando && (
            <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo)' }}>
                Bug corregido (12/09/2026): una factura con el desglose por tramos ya correcto podía seguir apareciendo en el trimestral como "impuesto sin identificar" si el campo antiguo no se había resincronizado. Esto lo arregla sin necesidad de IA — es un cálculo directo, no reextrae ni cambia ningún importe.
              </p>
              {resultadoSync ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: resultadoSync.corregidas > 0 ? 'var(--verde, #2e7d32)' : 'var(--topo-claro)' }}>
                  {resultadoSync.corregidas > 0
                    ? `✓ Se ha sincronizado el tipo de impuesto de ${resultadoSync.corregidas} factura${resultadoSync.corregidas !== 1 ? 's' : ''}.`
                    : 'No había ninguna factura por sincronizar — todo correcto.'}
                </p>
              ) : (
                <button
                  type="button" className={`${styles.btn} ${styles.btnSecundario}`}
                  style={{ alignSelf: 'flex-start', fontSize: '0.78rem' }}
                  onClick={sincronizarTipoImpuesto}
                  disabled={sincronizando || !tienePlanPro}
                  title={tienePlanPro ? undefined : 'Sincronizar tipo de impuesto es una función PRO'}
                >
                  {sincronizando ? 'Sincronizando…' : 'Sincronizar tipo de impuesto'} {!tienePlanPro && <CandadoPlan planMinimo="PRO" compacto />}
                </button>
              )}
            </div>
          )}

          {resultado && !propuestas && (
            <>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                {resultado.total === 0
                  ? 'No hay ninguna factura con un desglose fiscal que no cuadre — todo correcto.'
                  : <>Se han encontrado <strong>{resultado.total}</strong> factura{resultado.total !== 1 ? 's' : ''} con algo que revisar.</>}
              </p>
              {resultado.total > 0 && (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {Object.entries(resultado.porCategoria).map(([categoria, n]) => (
                    <li key={categoria}>{ETIQUETA_CATEGORIA[categoria] ?? categoria}: <strong>{n}</strong></li>
                  ))}
                </ul>
              )}
              {resultado.total > 0 && !corrigiendo && (
                <button
                  type="button" className={`${styles.btn} ${styles.btnPrimario}`}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={corregirConIA}
                  disabled={!tienePlanPro}
                  title={tienePlanPro ? undefined : 'Corregir con IA es una función PRO'}
                >
                  Corregir con IA (revisar antes de guardar) {!tienePlanPro && <CandadoPlan planMinimo="PRO" compacto />}
                </button>
              )}
              {corrigiendo && progreso && (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
                  Reextrayendo con IA… {progreso.hecho} de {progreso.total}.
                </p>
              )}
              {resultado.total > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                  {resultado.facturas.map((f) => (
                    <div key={f.id} style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.85rem' }}>{f.proveedor || f.concepto || 'Sin nombre'}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{f.fecha} · {f.importe.toFixed(2)}€</span>
                      </div>
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--ocre, #a67c00)' }}>{ETIQUETA_CATEGORIA[f.categoria] ?? f.categoria}</span>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo)' }}>{f.explicacion}</p>
                      {f.diferencia !== null && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>Diferencia: {f.diferencia.toFixed(2)}€</span>
                      )}
                      <button
                        type="button" className={`${styles.btn} ${styles.btnSecundario}`}
                        style={{ alignSelf: 'flex-start', fontSize: '0.74rem', marginTop: '0.2rem' }}
                        onClick={() => abrir(f.id)}
                        disabled={abriendoId === f.id}
                      >
                        {abriendoId === f.id ? 'Abriendo…' : 'Abrir para corregir a mano'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {propuestas && !resumenAplicado && (
            <>
              {avisoLimiteIA && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--rojo)' }}>
                  Se ha agotado el límite de peticiones a la IA a mitad de camino — se han procesado {progreso?.hecho} de {progreso?.total}. Inténtalo de nuevo en unos minutos para el resto.
                </p>
              )}
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                La IA ha podido corregir <strong>{listas.length}</strong> factura{listas.length !== 1 ? 's' : ''} con un desglose que ya cuadra — revísalas abajo antes de aplicarlas. No se ha guardado nada todavía.
              </p>
              {listas.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 260, overflowY: 'auto' }}>
                  {listas.map((p) => (
                    <div key={p.id} style={{ border: '1px solid var(--verde, #2e7d32)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <strong style={{ fontSize: '0.83rem' }}>{p.proveedor || p.concepto || 'Sin nombre'} · {p.importe.toFixed(2)}€</strong>
                      <span style={{ fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
                        Antes: base {p.baseAnterior?.toFixed(2) ?? '—'}€ · cuota {p.cuotaAnterior?.toFixed(2) ?? '—'}€
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--verde, #2e7d32)', fontWeight: 600 }}>
                        Ahora: base {p.baseNueva?.toFixed(2)}€ · cuota {p.cuotaNueva?.toFixed(2)}€ ({p.lineasNuevas?.length} tramo{p.lineasNuevas?.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {noListas.length > 0 && (
                <>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
                    {noListas.length} factura{noListas.length !== 1 ? 's' : ''} necesita{noListas.length === 1 ? '' : 'n'} revisión manual — la IA no ha podido resolverlas con seguridad:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.76rem', color: 'var(--topo-claro)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {noListas.map((p) => (
                      <li key={p.id}>{p.proveedor || p.concepto || 'Sin nombre'} — {p.mensaje}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {resumenAplicado && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--verde, #2e7d32)' }}>
              ✓ Aplicadas {resumenAplicado.aplicadas} factura{resumenAplicado.aplicadas !== 1 ? 's' : ''}
              {resumenAplicado.fallidas > 0 && `, ${resumenAplicado.fallidas} no se pudieron guardar — vuelve a intentarlo con esas`}.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              Cerrar
            </button>
            {propuestas && !resumenAplicado && listas.length > 0 && (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={aplicarCorrecciones} disabled={aplicando} style={{ flex: 2, justifyContent: 'center' }}>
                {aplicando ? 'Aplicando…' : `Aplicar ${listas.length} corrección${listas.length !== 1 ? 'es' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
