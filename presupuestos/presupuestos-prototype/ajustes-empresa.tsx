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

  const subirLogo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    leerArchivoComoBase64(file).then(setLogo);
  };

  const guardar = () => {
    onGuardar({ nombre: nombre.trim() || 'Mi empresa', eslogan: eslogan.trim(), logo });
    onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>🏷️ Logo y datos de empresa</h2>

        <div className={styles.logoZona}>
          <div className={styles.logoPreview}>
            {logo ? (
              <img src={logo} alt="Logo" className={styles.logoPreviewImg} />
            ) : (
              <span className={styles.logoPlaceholder}>🪚</span>
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
        </div>

        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
