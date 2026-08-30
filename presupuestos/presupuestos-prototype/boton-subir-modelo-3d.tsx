import { useRef } from 'react';
import styles from './styles.module.css';

export type BotonSubirModelo3DProps = {
  subiendo: boolean;
  onArchivo: (file: File) => void;
  /** "Subir dibujo 3D" (sin modelo todavía) vs "Reemplazar dibujo 3D" (ya hay uno) — mismo botón, mismo input. */
  reemplazar?: boolean;
};

/**
 * Botón "Subir dibujo 3D" (Fase "Diseño 3D", 30/08/2026) — se coloca en
 * la cabecera de "Archivos del proyecto", junto a "Subir PDF o imágenes"
 * (mismo estilo de rectángulo), no en una sección aparte.
 */
export function BotonSubirModelo3D({ subiendo, onArchivo, reemplazar }: BotonSubirModelo3DProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnSecundario}`}
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44a1.02 1.02 0 0 1-1.14 0l-7.9-4.44A1 1 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44a1.02 1.02 0 0 1 1.14 0l7.9 4.44c.32.17.53.5.53.88Z" /><path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></svg>
        {subiendo ? 'Subiendo…' : reemplazar ? 'Reemplazar dibujo 3D' : 'Subir dibujo 3D'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.stl,model/gltf-binary"
        className={styles.inputFile}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onArchivo(file);
        }}
      />
    </>
  );
}
