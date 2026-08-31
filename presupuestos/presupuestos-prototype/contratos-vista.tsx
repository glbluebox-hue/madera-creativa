import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { ContratoMC } from './contratos-modelo.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { EditorDocumento } from './editor-documento.js';
import { VisorPresupuestoFirmado } from './visor-presupuesto-firmado.js';
import { generarId } from './mock.js';
import { formatoFecha, formatoEuroPrivado } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

export type ContratosVistaProps = {
  clienteId: string;
  clienteNombre: string;
  empresa: Empresa;
  privado: boolean;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
};

/**
 * Contrato (Motor Documental, Incremento 12 — segundo tipo de documento).
 * Deliberadamente más simple que `PresupuestosVista`: un Contrato nace ya
 * como `DocumentoMC` puro, sin la dualidad de formato ni el editor legado
 * de Presupuesto — solo título + `EditorDocumento`, abierto directamente
 * (sin pasar por `AbrirDocumento`, que es una decisión propia de
 * Presupuesto entre su editor legado y el nuevo). Prueba real de que el
 * núcleo del Motor Documental se reutiliza sin cambios para un tipo de
 * documento de negocio distinto (Regla de Oro 4).
 */
export function ContratosVista({ clienteId, clienteNombre, empresa, privado, onActualizarEmpresa }: ContratosVistaProps) {
  const [contratos, setContratos] = useState<ContratoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentoAbierto, setDocumentoAbierto] = useState<ContratoMC | null>(null);
  const [tituloNuevo, setTituloNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  /**
   * Presupuestos ya aceptados de este proyecto — se muestran también aquí,
   * en Contratos, porque para el usuario un presupuesto firmado por el
   * cliente ES un contrato cerrado (petición explícita, 31/08/2026).
   * Nunca se copian: se piden con la misma llamada que ya usa la pestaña
   * "Presupuestos" (`obtenerPresupuestosDeProyecto`) y se abren con el
   * mismo visor de solo lectura (`VisorPresupuestoFirmado`) — un Contrato
   * de verdad y un Presupuesto aceptado siguen siendo dos cosas distintas
   * por debajo, esto solo los junta en la misma pantalla para que el
   * carpintero no tenga que ir a buscar el segundo a otra sección.
   */
  const [presupuestosFirmados, setPresupuestosFirmados] = useState<PresupuestoMC[]>([]);
  const [firmadoAVer, setFirmadoAVer] = useState<PresupuestoMC | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      api.obtenerContratos(clienteId),
      api.obtenerPresupuestosDeProyecto(clienteId).catch(() => []),
    ])
      .then(([listaContratos, listaPresupuestos]) => {
        setContratos(listaContratos);
        setPresupuestosFirmados(listaPresupuestos.filter((p) => p.estado === 'aceptado'));
      })
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, [clienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    if (!tituloNuevo.trim()) return;
    setCreando(true);
    const ahora = new Date().toISOString();
    const nuevo: ContratoMC = {
      id: generarId(), clienteId, titulo: tituloNuevo.trim(),
      contenidoDocumento: {}, creado: ahora, actualizado: ahora,
    };
    try {
      const guardado = await api.guardarContrato(nuevo);
      setContratos((prev) => [guardado, ...prev]);
      setTituloNuevo('');
      setDocumentoAbierto(guardado);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setCreando(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await api.borrarContrato(id);
      setContratos((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const guardarDocumentoAbierto = async (c: ContratoMC) => {
    const guardado = await api.guardarContrato(c);
    setContratos((prev) => {
      const existe = prev.some((x) => x.id === guardado.id);
      return existe ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...prev];
    });
    setDocumentoAbierto(guardado);
  };

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando contratos…</p>;

  if (firmadoAVer) {
    // Sin `onEditar` a propósito: petición explícita del usuario, 31/08/2026
    // ("con el editor si quieres, no le veo la utilidad realmente") — desde
    // Contratos, un presupuesto aceptado se ve solo como el contrato
    // cerrado que es. Corregirlo de verdad sigue disponible desde la
    // pestaña "Presupuestos" de esta misma ficha.
    return (
      <VisorPresupuestoFirmado
        presupuesto={firmadoAVer}
        empresa={empresa}
        onCerrar={() => setFirmadoAVer(null)}
      />
    );
  }

  if (documentoAbierto) {
    return (
      <EditorDocumento
        contenedor={documentoAbierto}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
        empresa={empresa}
        onGuardar={(c) => guardarDocumentoAbierto({ ...documentoAbierto, ...c })}
        onVolver={() => setDocumentoAbierto(null)}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
      />
    );
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      {presupuestosFirmados.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
            {presupuestosFirmados.length} presupuesto{presupuestosFirmados.length !== 1 ? 's' : ''} firmado{presupuestosFirmados.length !== 1 ? 's' : ''} por el cliente.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {presupuestosFirmados.map((p) => (
              <button
                key={p.id}
                onClick={() => setFirmadoAVer(p)}
                className={styles.filaLista}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem',
                  width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', font: 'inherit', color: 'inherit',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {p.titulo}
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--verde)', background: 'var(--verde-bg)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radio-full, 999px)' }}>✓ Firmado</span>
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Aceptado {p.firmaClienteFecha ? formatoFecha(p.firmaClienteFecha) : formatoFecha(p.actualizado)}
                  </p>
                </div>
                <strong style={{ fontSize: '0.95rem', flexShrink: 0 }}>{formatoEuroPrivado(p.precioTotal, privado)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          {contratos.length} contrato{contratos.length !== 1 ? 's' : ''}.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            className={styles.input}
            placeholder="Título del contrato nuevo"
            value={tituloNuevo}
            onChange={(e) => setTituloNuevo(e.target.value)}
            style={{ fontSize: '0.82rem' }}
          />
          <button
            className={styles.btnCirculoOscuro}
            onClick={crear}
            disabled={creando || !tituloNuevo.trim()}
            title="Crear contrato"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>

      {contratos.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>Este cliente todavía no tiene ningún contrato. Créalo con «+ Crear contrato».</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {contratos.map((c) => (
            <div key={c.id} className={styles.filaLista} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem',
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{c.titulo}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>Creado {formatoFecha(c.creado)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setDocumentoAbierto(c)}>Abrir editor</button>
                <ConfirmarBorrado onConfirmar={() => borrar(c.id)} titulo="Borrar contrato" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
