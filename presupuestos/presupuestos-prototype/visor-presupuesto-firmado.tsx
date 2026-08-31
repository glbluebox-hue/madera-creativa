import { useEffect, useState } from 'react';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { DocumentoMC, ComponenteMC } from './documento-modelo.js';
import type { Empresa } from './use-empresa.js';
import { VisorDocumento } from './visor-documento.js';
import { formatoFecha } from './calculos.js';
import * as api from './api.js';
import styles from './styles.module.css';

export type VisorPresupuestoFirmadoProps = {
  presupuesto: PresupuestoMC;
  empresa: Empresa;
  onCerrar: () => void;
  /**
   * Escape hatch — el editor completo, para cuando de verdad hace falta
   * corregir algo. Nunca la acción por defecto aquí. Opcional: desde
   * Contratos (`contratos-vista.tsx`) no se ofrece — petición explícita
   * del usuario, 31/08/2026 ("con el editor si quieres, no le veo la
   * utilidad realmente" — ahí un presupuesto aceptado se ve solo como el
   * contrato que es, sin invitar a tocarlo).
   */
  onEditar?: () => void;
};

/**
 * Vista de SOLO LECTURA de un presupuesto ya aceptado — "el contrato", tal
 * como lo firmó el cliente. Petición explícita del usuario, 31/08/2026: al
 * abrir un presupuesto ya firmado no quiere entrar al editor de
 * arrastrar-y-soltar (arriesga tocar sin querer un documento que ya es, en
 * la práctica, un contrato cerrado) — quiere "una imagen o un PDF... con
 * las dos firmas", igual que lo vería si lo abriera desde el Portal del
 * cliente.
 *
 * Reutiliza el mismo `VisorDocumento` del Portal (`portal-presupuesto.tsx`)
 * — misma resolución de `firma_cliente`/`firma_empresa` en el sitio exacto
 * donde el carpintero puso cada elemento, así que lo que ve aquí es
 * pixel a pixel lo que vio y firmó el cliente. "Editar" sigue disponible,
 * pero como enlace secundario al pie, no el botón principal.
 */
export function VisorPresupuestoFirmado({ presupuesto, empresa, onCerrar, onEditar }: VisorPresupuestoFirmadoProps) {
  const [componentes, setComponentes] = useState<ComponenteMC[]>([]);
  const [modoImpresion, setModoImpresion] = useState(false);

  useEffect(() => {
    if (presupuesto.formato !== 'documento') return;
    api.obtenerComponentes().then(setComponentes).catch(() => {});
  }, [presupuesto.formato]);

  // Mismo patrón que "Exportar a PDF" del editor (editor-documento.tsx) —
  // un frame para que React pinte en modo impresión (sin overlay ni
  // botones) antes del diálogo nativo, que es síncrono y bloquea.
  useEffect(() => {
    const alTerminar = () => setModoImpresion(false);
    window.addEventListener('afterprint', alTerminar);
    return () => window.removeEventListener('afterprint', alTerminar);
  }, []);

  const imprimir = () => {
    setModoImpresion(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const contenido = (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
      {!modoImpresion && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{presupuesto.titulo}</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--verde)', fontWeight: 700 }}>
              ✓ Aceptado{presupuesto.firmaClienteFecha ? ` el ${formatoFecha(presupuesto.firmaClienteFecha)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={imprimir}>🖨️ Descargar PDF</button>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
          </div>
        </div>
      )}

      {presupuesto.formato === 'documento' && presupuesto.contenidoDocumento ? (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <VisorDocumento
            documento={presupuesto.contenidoDocumento as unknown as DocumentoMC}
            logoEmpresa={empresa.logo ?? undefined}
            precioVinculado={presupuesto.precioTotal}
            firmaEmpresa={empresa.firmaEmpresa ?? undefined}
            firmaClienteUrl={presupuesto.firmaClienteUrl}
            firmaClienteFecha={presupuesto.firmaClienteFecha}
            componentes={componentes}
          />
        </div>
      ) : (
        // Formato antiguo ('simple'/'lienzo') — nunca tuvo el concepto de
        // "colocar la firma en un sitio del documento", así que no hay
        // nada que renderizar aquí de solo lectura; se manda directo al
        // editor, como siempre hizo este formato.
        <div className={styles.panel} style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--topo-claro)', margin: '0 0 1rem' }}>Este presupuesto usa el formato antiguo y no tiene vista de solo lectura.</p>
          {onEditar && <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={onEditar}>Abrir</button>}
        </div>
      )}

      {!modoImpresion && presupuesto.formato === 'documento' && onEditar && (
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button className={styles.volver} onClick={onEditar}>¿Necesitas corregir algo? Editar este presupuesto</button>
        </p>
      )}
    </div>
  );

  // Sin `.overlay` (position:fixed) durante la impresión — un contenedor
  // fijo con scroll propio solo deja imprimir lo que cabe en el viewport;
  // en flujo normal, `.pagina{page-break-after}` (editor-documento.module.css,
  // reutilizado por VisorDocumento) pagina el documento completo.
  if (modoImpresion) return <div className={styles.visorPresupuestoImpresion}>{contenido}</div>;
  return (
    <div className={styles.overlay} onClick={onCerrar}>
      {contenido}
    </div>
  );
}
