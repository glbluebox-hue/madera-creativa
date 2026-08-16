/**
 * Identificador de cada herramienta de la barra propia del editor de
 * dibujo. `rectangle` | `diamond` | `ellipse` | `image` corresponden 1:1 a
 * tipos de herramienta nativos de Excalidraw (`setActiveTool({ type })`,
 * ver `seleccionarHerramienta` en `editor-dibujo.tsx`) — antes solo vivían
 * en la barra nativa de Excalidraw, oculta por CSS (`editorDibujoLienzo`);
 * se exponen aquí para que sigan disponibles desde la barra propia.
 */
export type HerramientaId = 'selection' | 'rectangle' | 'diamond' | 'ellipse' | 'freedraw' | 'line' | 'arrow' | 'text' | 'image' | 'eraser' | 'cota';
