import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as api from './api.js';
import type { PresupuestoPublico } from './presupuestos-modelo.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { FirmaCanvas } from './firma-canvas.js';
import styles from './styles.module.css';

/**
 * Página pública del Portal del cliente — sin sidebar, sin login. Se abre
 * desde el enlace que comparte el carpintero (WhatsApp, email…). Todo el
 * estado vive en este componente; no toca `use-auth.ts` ni ningún otro
 * mecanismo de sesión (no hay sesión).
 */
export function PortalPresupuesto() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState('');
  const [presupuesto, setPresupuesto] = useState<PresupuestoPublico | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    if (!token) return;
    setEstado('cargando');
    api.obtenerPresupuestoPublico(token)
      .then((p) => { setPresupuesto(p); setEstado('listo'); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'No se pudo cargar el presupuesto'); setEstado('error'); });
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  const firmar = async (firmaDataUrl: string) => {
    if (!token) return;
    setEnviando(true);
    try {
      await api.aceptarPresupuestoPublico(token, firmaDataUrl);
      setFirmando(false);
      cargar(); // Trae el estado real del servidor (incluida la firma ya guardada) en vez de adivinarlo localmente.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar el presupuesto');
    } finally {
      setEnviando(false);
    }
  };

  return (
    // La clase `app` es imprescindible, no solo estética: TODOS los tokens
    // de color de la aplicación (--blanco, --topo, --borde, --verde, --rojo…)
    // están declarados dentro de `.app` en styles.module.css, no en `:root`
    // — sin esta clase aquí, cada `var(--algo)` de esta página (y de las
    // clases reutilizadas como `styles.panel`) no resuelve a nada, y el
    // texto (negro por defecto del navegador) queda ilegible sobre el fondo
    // oscuro global de <body> en modo oscuro (bug real, reportado por un
    // cliente probando el enlace desde el móvil, 17/08/2026). Sin
    // `data-theme` propio a propósito: esta página nunca tiene sesión ni
    // preferencia de tema guardada, así que sigue `prefers-color-scheme`
    // del dispositivo del cliente automáticamente.
    <div className={styles.app} style={{ minHeight: '100vh', background: 'var(--fondo)', display: 'flex', justifyContent: 'center', padding: '1.25rem 1rem 3rem' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>
        {estado === 'cargando' && (
          <p style={{ textAlign: 'center', color: 'var(--topo-claro)', marginTop: '3rem' }}>Cargando…</p>
        )}

        {estado === 'error' && (
          <div className={styles.panel} style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Este enlace no está disponible</p>
            <p style={{ color: 'var(--topo-claro)', fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}

        {estado === 'listo' && presupuesto && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              {presupuesto.empresa.logo && (
                // Mismo tamaño que el logo de la barra lateral
                // (`.sidebarLogoImg`) — la referencia de "cómo se veía
                // antes" que ya usa el resto de la aplicación, en vez de un
                // tamaño inventado aparte para esta página.
                <img src={presupuesto.empresa.logo} alt={presupuesto.empresa.nombre} style={{ width: '100%', maxWidth: '140px', height: 'auto', objectFit: 'contain' }} />
              )}
              {!presupuesto.empresa.logo && presupuesto.empresa.nombre && (
                <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{presupuesto.empresa.nombre}</p>
              )}
            </div>

            <div className={styles.panel}>
              <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem', margin: '0 0 0.2rem' }}>Presupuesto para {presupuesto.clienteNombre}</p>
              <h2 style={{ margin: '0 0 0.75rem' }}>{presupuesto.titulo}</h2>

              {presupuesto.descripcion && (
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.92rem' }}>{presupuesto.descripcion}</p>
              )}

              {presupuesto.alcance.length > 0 && (
                <ul style={{ paddingLeft: '1.2rem', margin: '0.75rem 0', fontSize: '0.9rem' }}>
                  {presupuesto.alcance.map((linea, i) => <li key={i}>{linea}</li>)}
                </ul>
              )}

              {presupuesto.items.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  {presupuesto.items.map((it) => (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--borde-fino)', fontSize: '0.9rem' }}>
                      <span>{it.concepto}</span>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '1rem' }}>{formatoEuro(it.precio)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '2px solid var(--borde)' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: '1.3rem' }}>{formatoEuro(presupuesto.precioTotal)}</span>
              </div>

              {(presupuesto.condicionesPago || presupuesto.condicionesGenerales) && (
                <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--topo-claro)', whiteSpace: 'pre-wrap' }}>
                  {presupuesto.condicionesPago && <p style={{ margin: '0 0 0.4rem' }}><strong>Condiciones de pago:</strong> {presupuesto.condicionesPago}</p>}
                  {presupuesto.condicionesGenerales && <p style={{ margin: 0 }}>{presupuesto.condicionesGenerales}</p>}
                  <p style={{ margin: '0.4rem 0 0' }}>Oferta válida hasta el {formatoFecha(presupuesto.expiraEn)}.</p>
                </div>
              )}
            </div>

            <div className={styles.panel} style={{ marginTop: '1rem', textAlign: 'center' }}>
              {presupuesto.estado === 'aceptado' ? (
                <>
                  <p style={{ color: 'var(--verde)', fontWeight: 700, marginBottom: presupuesto.firmaClienteUrl ? '0.75rem' : 0 }}>
                    ✓ Aceptado {presupuesto.firmaClienteFecha ? `el ${formatoFecha(presupuesto.firmaClienteFecha)}` : ''}
                  </p>
                  {presupuesto.firmaClienteUrl && (
                    <img src={presupuesto.firmaClienteUrl} alt="Firma" style={{ maxWidth: '260px', maxHeight: '120px', border: '1px solid var(--borde-fino)', borderRadius: '8px', background: 'var(--blanco)' }} />
                  )}
                </>
              ) : firmando ? (
                <FirmaCanvas onFirmar={firmar} onCancelar={() => setFirmando(false)} enviando={enviando} />
              ) : (
                <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setFirmando(true)} style={{ width: '100%', fontSize: '1rem', padding: '0.85rem' }}>
                  Aceptar presupuesto
                </button>
              )}
              {error && estado === 'listo' && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginTop: '0.6rem' }}>{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
