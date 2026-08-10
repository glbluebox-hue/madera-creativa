import { useRef, useState } from 'react';
import type { Empresa } from './use-empresa.js';
import { leerArchivoComoBase64 } from './archivos.js';
import styles from './styles.module.css';

/** Props del modal de ajustes de empresa. */
export type AjustesEmpresaProps = {
  /** Datos actuales de la empresa. */
  empresa: Empresa;
  /** Guarda los cambios de la empresa. */
  onGuardar: (cambios: Partial<Empresa>) => void;
  /** Cierra el modal. */
  onCerrar: () => void;
};

/**
 * Modal para configurar la marca de la empresa: subir o cambiar el logo,
 * editar el nombre y el eslogan.
 */
export function AjustesEmpresa({ empresa, onGuardar, onCerrar }: AjustesEmpresaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState(empresa.nombre);
  const [eslogan, setEslogan] = useState(empresa.eslogan);
  const [logo, setLogo] = useState<string | null>(empresa.logo);
  const [telefono, setTelefono] = useState(empresa.telefono);
  const [email, setEmail] = useState(empresa.email);
  const [iban, setIban] = useState(empresa.iban);
  const [condicionesPagoDefecto, setCondicionesPagoDefecto] = useState(empresa.condicionesPagoDefecto);
  const [validezDiasDefecto, setValidezDiasDefecto] = useState(String(empresa.validezDiasDefecto));

  const subirLogo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    leerArchivoComoBase64(file).then(setLogo);
  };

  const guardar = () => {
    onGuardar({
      nombre: nombre.trim() || 'Mi empresa',
      eslogan: eslogan.trim(),
      logo,
      telefono: telefono.trim(),
      email: email.trim(),
      iban: iban.trim(),
      condicionesPagoDefecto: condicionesPagoDefecto.trim(),
      validezDiasDefecto: Number(validezDiasDefecto) || 30,
    });
    onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
          Logo y datos de empresa
        </h2>

        <div className={styles.logoZona}>
          <div className={styles.logoPreview}>
            {logo ? (
              <img src={logo} alt="Logo" className={styles.logoPreviewImg} />
            ) : (
              <span className={styles.logoPlaceholder} style={{ display: 'flex', color: 'var(--topo-muy-claro)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              </span>
            )}
          </div>
          <div className={styles.logoAcciones}>
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              onClick={() => inputRef.current?.click()}
            >
              {logo ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {logo && (
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setLogo(null)}>
                Quitar logo
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className={styles.inputFile}
              onChange={(e) => subirLogo(e.target.files)}
            />
            <p className={styles.logoAyuda}>Formatos: PNG, JPG o SVG.</p>
          </div>
        </div>

        <div className={styles.formGrid}>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Nombre de la empresa</label>
            <input className={styles.input} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Eslogan</label>
            <input className={styles.input} value={eslogan} onChange={(e) => setEslogan(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Teléfono</label>
            <input className={styles.input} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Email</label>
            <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>IBAN (para presupuestos con condiciones de pago)</label>
            <input className={styles.input} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Condiciones de pago por defecto</label>
            <input className={styles.input} value={condicionesPagoDefecto} onChange={(e) => setCondicionesPagoDefecto(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Validez del presupuesto (días)</label>
            <input className={styles.input} type="number" min="1" value={validezDiasDefecto} onChange={(e) => setValidezDiasDefecto(e.target.value)} />
          </div>
        </div>

        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
