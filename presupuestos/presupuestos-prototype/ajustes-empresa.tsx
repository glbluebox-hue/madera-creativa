import { useRef, useState } from 'react';
import type { Empresa } from './use-empresa.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { TEMA_POR_DEFECTO } from './documento-modelo.js';
import type { TemaMC } from './documento-modelo.js';
import styles from './styles.module.css';

/** Props del modal de ajustes de empresa. */
export type AjustesEmpresaProps = {
  /** Datos actuales de la empresa. */
  empresa: Empresa;
  /** Guarda los cambios de la empresa — devuelve si tuvo éxito. */
  onGuardar: (cambios: Partial<Empresa>) => Promise<boolean>;
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
  const [nifCif, setNifCif] = useState(empresa.nifCif);
  const [telefono, setTelefono] = useState(empresa.telefono);
  const [email, setEmail] = useState(empresa.email);
  const [iban, setIban] = useState(empresa.iban);
  const [condicionesPagoDefecto, setCondicionesPagoDefecto] = useState(empresa.condicionesPagoDefecto);
  const [validezDiasDefecto, setValidezDiasDefecto] = useState(String(empresa.validezDiasDefecto));
  const [tema, setTema] = useState<TemaMC>(empresa.temaPorDefecto ?? TEMA_POR_DEFECTO);
  const [regionFiscal, setRegionFiscal] = useState(empresa.regionFiscal);
  const [repepActivo, setRepepActivo] = useState(empresa.repepActivo);
  const [logoTamano, setLogoTamano] = useState(empresa.logoTamano || 187);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  const subirLogo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    leerArchivoComoBase64(file).then(setLogo);
  };

  const guardar = async () => {
    setErrorGuardar('');
    setGuardando(true);
    const ok = await onGuardar({
      nombre: nombre.trim() || 'Mi empresa',
      eslogan: eslogan.trim(),
      logo,
      nifCif: nifCif.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      iban: iban.trim(),
      condicionesPagoDefecto: condicionesPagoDefecto.trim(),
      validezDiasDefecto: Number(validezDiasDefecto) || 30,
      temaPorDefecto: tema,
      regionFiscal,
      repepActivo: regionFiscal === 'canarias' ? repepActivo : false,
      logoTamano,
    });
    setGuardando(false);
    if (!ok) { setErrorGuardar('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.'); return; }
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

        {logo && (
          <div className={styles.campo} style={{ marginBottom: '1.25rem' }}>
            <label className={styles.campoLabel}>Tamaño del logo en el menú lateral</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min={60}
                max={320}
                step={1}
                value={logoTamano}
                onChange={(e) => setLogoTamano(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--topo-claro)', width: '38px', textAlign: 'right' }}>{logoTamano}px</span>
            </div>
            {/* Vista previa en vivo — mismo fondo/recorte que la barra lateral real, para que el ajuste no sea a ciegas. */}
            <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'var(--blanco)', border: '1px solid var(--borde)', borderRadius: 'var(--radio)', textAlign: 'center' }}>
              <img src={logo} alt="Vista previa del logo" style={{ width: '100%', maxWidth: `${logoTamano}px`, height: 'auto', objectFit: 'contain' }} />
            </div>
          </div>
        )}

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
            <label className={styles.campoLabel}>CIF/NIF de la empresa</label>
            <input className={styles.input} value={nifCif} onChange={(e) => setNifCif(e.target.value)} placeholder="B12345678" />
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
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Región fiscal — determina si el Trimestral calcula IGIC (Canarias) o IVA (Península)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className={`${styles.btn} ${regionFiscal === 'canarias' ? styles.btnPrimario : styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setRegionFiscal('canarias')}>Canarias (IGIC)</button>
              <button type="button" className={`${styles.btn} ${regionFiscal === 'peninsula' ? styles.btnPrimario : styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setRegionFiscal('peninsula')}>Península (IVA)</button>
            </div>
            {regionFiscal === 'canarias' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem', fontSize: '0.82rem', color: 'var(--topo)' }}>
                <input type="checkbox" checked={repepActivo} onChange={(e) => setRepepActivo(e.target.checked)} />
                Acogido al REPEP (exención de IGIC por facturación ≤50.000€/año)
              </label>
            )}
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Tema corporativo (Motor Documental) — con el que arranca todo documento nuevo</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: 'var(--topo-claro)', gap: '0.2rem' }}>
                Primario
                <input type="color" value={tema.colores.primario} onChange={(e) => setTema({ ...tema, colores: { ...tema.colores, primario: e.target.value } })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: 'var(--topo-claro)', gap: '0.2rem' }}>
                Secundario
                <input type="color" value={tema.colores.secundario} onChange={(e) => setTema({ ...tema, colores: { ...tema.colores, secundario: e.target.value } })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: 'var(--topo-claro)', gap: '0.2rem' }}>
                Fuente de títulos
                <select className={styles.input} value={tema.tipografias.titulos} onChange={(e) => setTema({ ...tema, tipografias: { ...tema.tipografias, titulos: e.target.value } })}>
                  <option value="Georgia">Georgia</option>
                  <option value="Arial">Arial</option>
                  <option value="'Times New Roman'">Times New Roman</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.72rem', color: 'var(--topo-claro)', gap: '0.2rem' }}>
                Fuente de cuerpo
                <select className={styles.input} value={tema.tipografias.cuerpo} onChange={(e) => setTema({ ...tema, tipografias: { ...tema.tipografias, cuerpo: e.target.value } })}>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {errorGuardar && <div className={styles.loginError}>{errorGuardar}</div>}

        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
