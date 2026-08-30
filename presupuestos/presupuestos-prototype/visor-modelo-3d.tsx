import '@google/model-viewer';

/**
 * Visor 3D (Fase "Diseño 3D", 30/08/2026) — componente de presentación
 * PURO: recibe una URL y un nombre, y pinta el modelo. No sabe si el
 * archivo vino de una subida manual o (en el futuro) de una integración
 * con Trimble Connect — el día que esa integración exponga una URL de
 * descarga/preview de un `.glb`, este mismo componente sirve para los
 * dos orígenes, sin cambiar nada aquí.
 *
 * `<model-viewer>` (custom element oficial de Google, `@google/model-viewer`)
 * da gratis, con solo estos atributos: rotar/zoom/paneo (`camera-controls`)
 * y encuadre automático de cámara al cargar el modelo — sin escribir
 * código de Three.js/cámara/luces a mano.
 */

// Aumenta el namespace JSX de React 19 (vive dentro de `React.JSX`, no en
// el global `JSX` de versiones anteriores) para reconocer el custom
// element `<model-viewer>` — el paquete no trae tipos de React, solo del
// propio elemento nativo.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'shadow-intensity'?: string;
        exposure?: string;
      };
    }
  }
}

export type VisorModelo3DProps = {
  src: string;
  nombreArchivo: string;
};

export function VisorModelo3D({ src, nombreArchivo }: VisorModelo3DProps) {
  return (
    <model-viewer
      src={src}
      alt={nombreArchivo}
      camera-controls
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      style={{ width: '100%', height: '100%', minHeight: 320, background: 'var(--fondo-caja)', borderRadius: 8 }}
    />
  );
}
