import type { HerramientaId } from './editor-dibujo-tipos.js';
import type { OrientacionCota } from './cota-modelo.js';

export type Idioma = 'es' | 'en' | 'it';

/** Selector de idioma del editor — 3 banderas, sin menú desplegable. */
export const IDIOMAS: { id: Idioma; bandera: string; label: string }[] = [
  { id: 'es', bandera: '🇪🇸', label: 'Español' },
  { id: 'en', bandera: '🇬🇧', label: 'English' },
  { id: 'it', bandera: '🇮🇹', label: 'Italiano' },
];

/** Código de idioma que entiende la interfaz nativa de Excalidraw (la poca que no ocultamos por CSS: menús contextuales, aria-labels, algún aviso puntual). */
export const EXCALIDRAW_LANG_CODE: Record<Idioma, string> = {
  es: 'es-ES',
  en: 'en',
  it: 'it-IT',
};

export type IdGrosor = 'extraFino' | 'ultraFino' | 'muyFino' | 'fino' | 'medio' | 'grueso';

type Textos = {
  volver: string;
  nombrePlaceholder: string;
  guardando: string;
  guardar: string;
  guardado: string;
  escalaLabel: string;
  escalaSinCalibrar: string;
  escalaFormato: (factorMm: number) => string;
  escalaFormatoPerspectiva: (anchoMm: number, altoMm: number) => string;
  escalaTitulo: string;
  calibrarSinCotas: string;
  calibrarCotaLabel: string;
  calibrarEtiquetaCota: (indice: number, longitudInterna: number) => string;
  calibrarValorLabel: string;
  calibrarBoton: string;
  calibrarModoCota: string;
  calibrarModoRectangulo: string;
  calibrarQuitar: string;
  calibrarRectanguloInstruccion: (numeroPunto: number) => string;
  calibrarRectanguloReiniciar: string;
  calibrarRectanguloAncho: string;
  calibrarRectanguloAlto: string;
  unidadVisualizacionTitulo: string;
  unidadVisualizacionBloqueada: string;
  cotaInstruccion: string;
  cotaArrastrando: string;
  herramientas: Record<HerramientaId, string>;
  orientaciones: Record<OrientacionCota, string>;
  grosores: Record<IdGrosor, string>;
  deshacer: string;
  rehacer: string;
  acercar: string;
  alejar: string;
  ajustarPantalla: string;
  color: string;
  idiomaTitulo: string;
  pantallaCompleta: string;
  salirPantallaCompleta: string;
  ocultarHerramientas: string;
  mostrarHerramientas: string;
  edicionLongitudLabel: string;
  edicionLongitudLabelSinCalibrar: string;
  edicionLongitudBoton: string;
  borrarCota: string;
};

export const TEXTOS: Record<Idioma, Textos> = {
  es: {
    volver: 'Volver a Dibujos',
    nombrePlaceholder: 'Nombre del dibujo',
    guardando: 'Guardando…',
    guardar: 'Guardar',
    guardado: 'Guardado',
    escalaLabel: 'Escala del dibujo:',
    escalaSinCalibrar: 'Sin calibrar (toca para calibrar)',
    escalaFormato: (factorMm) => `1 u = ${factorMm.toFixed(3)} mm`,
    escalaFormatoPerspectiva: (anchoMm, altoMm) => `Perspectiva corregida (${(anchoMm / 10).toFixed(0)}×${(altoMm / 10).toFixed(0)} cm)`,
    escalaTitulo: 'Las cotas de este dibujo se muestran en unidades internas hasta que se calibre una escala real. Toca para calibrar.',
    calibrarSinCotas: 'Primero dibuja una cota; luego podrás calibrar con su medida real.',
    calibrarCotaLabel: 'Cota de referencia',
    calibrarEtiquetaCota: (i, longitud) => `Cota #${i} — ${longitud} u`,
    calibrarValorLabel: 'Su medida real',
    calibrarBoton: 'Calibrar',
    calibrarModoCota: 'Con una cota',
    calibrarModoRectangulo: 'Con un rectángulo',
    calibrarQuitar: 'Quitar calibración (empezar de cero)',
    calibrarRectanguloInstruccion: (n) => `Toca la esquina ${n} de 4 del rectángulo real (orden: arriba-izq., arriba-der., abajo-der., abajo-izq.)`,
    calibrarRectanguloReiniciar: 'Reiniciar puntos',
    calibrarRectanguloAncho: 'Ancho real del rectángulo',
    calibrarRectanguloAlto: 'Alto real del rectángulo',
    unidadVisualizacionTitulo: 'Unidad de visualización de las medidas',
    unidadVisualizacionBloqueada: 'Calibra el dibujo primero (toca "Sin calibrar") para poder elegir mm/cm/m',
    cotaInstruccion: 'Cota: pulsa, arrastra y suelta para medir',
    cotaArrastrando: 'Cota: arrastrando…',
    herramientas: {
      selection: 'Seleccionar', rectangle: 'Rectángulo', diamond: 'Rombo', ellipse: 'Elipse',
      freedraw: 'Lápiz', line: 'Línea', arrow: 'Flecha', text: 'Texto', image: 'Imagen',
      eraser: 'Goma', cota: 'Cota',
    },
    orientaciones: { alineada: 'Alineada', horizontal: 'Horizontal', vertical: 'Vertical' },
    grosores: {
      extraFino: 'Extra fino', ultraFino: 'Ultra fino', muyFino: 'Muy fino',
      fino: 'Fino', medio: 'Medio', grueso: 'Grueso',
    },
    deshacer: 'Deshacer (Ctrl+Z)',
    rehacer: 'Rehacer (Ctrl+Mayús+Z)',
    acercar: 'Acercar',
    alejar: 'Alejar',
    ajustarPantalla: 'Ajustar a la pantalla',
    color: 'Color',
    idiomaTitulo: 'Idioma del editor',
    pantallaCompleta: 'Pantalla completa',
    salirPantallaCompleta: 'Salir de pantalla completa',
    ocultarHerramientas: 'Ocultar herramientas',
    mostrarHerramientas: 'Mostrar herramientas',
    edicionLongitudLabel: 'Medida exacta de esta cota',
    edicionLongitudLabelSinCalibrar: 'Medida real de esta cota (calibra el dibujo con este valor)',
    edicionLongitudBoton: 'Aplicar',
    borrarCota: 'Borrar esta cota',
  },
  en: {
    volver: 'Back to Drawings',
    nombrePlaceholder: 'Drawing name',
    guardando: 'Saving…',
    guardar: 'Save',
    guardado: 'Saved',
    escalaLabel: 'Drawing scale:',
    escalaSinCalibrar: 'Not calibrated (tap to calibrate)',
    escalaFormato: (factorMm) => `1 u = ${factorMm.toFixed(3)} mm`,
    escalaFormatoPerspectiva: (anchoMm, altoMm) => `Perspective corrected (${(anchoMm / 10).toFixed(0)}×${(altoMm / 10).toFixed(0)} cm)`,
    escalaTitulo: 'Dimensions in this drawing are shown in internal units until a real scale is calibrated. Tap to calibrate.',
    calibrarSinCotas: 'Draw a dimension first; then you can calibrate using its real measurement.',
    calibrarCotaLabel: 'Reference dimension',
    calibrarEtiquetaCota: (i, longitud) => `Dimension #${i} — ${longitud} u`,
    calibrarValorLabel: 'Its real measurement',
    calibrarBoton: 'Calibrate',
    calibrarModoCota: 'With a dimension',
    calibrarModoRectangulo: 'With a rectangle',
    calibrarQuitar: 'Remove calibration (start over)',
    calibrarRectanguloInstruccion: (n) => `Tap corner ${n} of 4 of the real rectangle (order: top-left, top-right, bottom-right, bottom-left)`,
    calibrarRectanguloReiniciar: 'Restart points',
    calibrarRectanguloAncho: 'Real width of the rectangle',
    calibrarRectanguloAlto: 'Real height of the rectangle',
    unidadVisualizacionTitulo: 'Unit used to display measurements',
    unidadVisualizacionBloqueada: 'Calibrate the drawing first (tap "Not calibrated") to choose mm/cm/m',
    cotaInstruccion: 'Dimension: press, drag and release to measure',
    cotaArrastrando: 'Dimension: dragging…',
    herramientas: {
      selection: 'Select', rectangle: 'Rectangle', diamond: 'Diamond', ellipse: 'Ellipse',
      freedraw: 'Pencil', line: 'Line', arrow: 'Arrow', text: 'Text', image: 'Image',
      eraser: 'Eraser', cota: 'Dimension',
    },
    orientaciones: { alineada: 'Aligned', horizontal: 'Horizontal', vertical: 'Vertical' },
    grosores: {
      extraFino: 'Extra thin', ultraFino: 'Ultra thin', muyFino: 'Very thin',
      fino: 'Thin', medio: 'Medium', grueso: 'Bold',
    },
    deshacer: 'Undo (Ctrl+Z)',
    rehacer: 'Redo (Ctrl+Shift+Z)',
    acercar: 'Zoom in',
    alejar: 'Zoom out',
    ajustarPantalla: 'Fit to screen',
    color: 'Color',
    idiomaTitulo: 'Editor language',
    pantallaCompleta: 'Full screen',
    salirPantallaCompleta: 'Exit full screen',
    ocultarHerramientas: 'Hide tools',
    mostrarHerramientas: 'Show tools',
    edicionLongitudLabel: 'Exact measurement for this dimension',
    edicionLongitudLabelSinCalibrar: 'Real measurement for this dimension (calibrates the drawing using this value)',
    edicionLongitudBoton: 'Apply',
    borrarCota: 'Delete this dimension',
  },
  it: {
    volver: 'Torna ai Disegni',
    nombrePlaceholder: 'Nome del disegno',
    guardando: 'Salvataggio…',
    guardar: 'Salva',
    guardado: 'Salvato',
    escalaLabel: 'Scala del disegno:',
    escalaSinCalibrar: 'Non calibrato (tocca per calibrare)',
    escalaFormato: (factorMm) => `1 u = ${factorMm.toFixed(3)} mm`,
    escalaFormatoPerspectiva: (anchoMm, altoMm) => `Prospettiva corretta (${(anchoMm / 10).toFixed(0)}×${(altoMm / 10).toFixed(0)} cm)`,
    escalaTitulo: 'Le quote di questo disegno sono mostrate in unità interne finché non si calibra una scala reale. Tocca per calibrare.',
    calibrarSinCotas: 'Disegna prima una quota; poi potrai calibrare con la sua misura reale.',
    calibrarCotaLabel: 'Quota di riferimento',
    calibrarEtiquetaCota: (i, longitud) => `Quota #${i} — ${longitud} u`,
    calibrarValorLabel: 'La sua misura reale',
    calibrarBoton: 'Calibra',
    calibrarModoCota: 'Con una quota',
    calibrarModoRectangulo: 'Con un rettangolo',
    calibrarQuitar: 'Rimuovi calibrazione (ricomincia)',
    calibrarRectanguloInstruccion: (n) => `Tocca l'angolo ${n} di 4 del rettangolo reale (ordine: alto-sx, alto-dx, basso-dx, basso-sx)`,
    calibrarRectanguloReiniciar: 'Ricomincia punti',
    calibrarRectanguloAncho: 'Larghezza reale del rettangolo',
    calibrarRectanguloAlto: 'Altezza reale del rettangolo',
    unidadVisualizacionTitulo: 'Unità di visualizzazione delle misure',
    unidadVisualizacionBloqueada: 'Calibra prima il disegno (tocca "Non calibrato") per scegliere mm/cm/m',
    cotaInstruccion: 'Quota: premi, trascina e rilascia per misurare',
    cotaArrastrando: 'Quota: trascinamento…',
    herramientas: {
      selection: 'Seleziona', rectangle: 'Rettangolo', diamond: 'Rombo', ellipse: 'Ellisse',
      freedraw: 'Matita', line: 'Linea', arrow: 'Freccia', text: 'Testo', image: 'Immagine',
      eraser: 'Gomma', cota: 'Quota',
    },
    orientaciones: { alineada: 'Allineata', horizontal: 'Orizzontale', vertical: 'Verticale' },
    grosores: {
      extraFino: 'Extra sottile', ultraFino: 'Ultra sottile', muyFino: 'Molto sottile',
      fino: 'Sottile', medio: 'Medio', grueso: 'Spesso',
    },
    deshacer: 'Annulla (Ctrl+Z)',
    rehacer: 'Ripeti (Ctrl+Maiusc+Z)',
    acercar: 'Ingrandisci',
    alejar: 'Riduci',
    ajustarPantalla: 'Adatta allo schermo',
    color: 'Colore',
    idiomaTitulo: 'Lingua dell’editor',
    pantallaCompleta: 'Schermo intero',
    salirPantallaCompleta: 'Esci da schermo intero',
    ocultarHerramientas: 'Nascondi strumenti',
    mostrarHerramientas: 'Mostra strumenti',
    edicionLongitudLabel: 'Misura esatta di questa quota',
    edicionLongitudLabelSinCalibrar: 'Misura reale di questa quota (calibra il disegno con questo valore)',
    edicionLongitudBoton: 'Applica',
    borrarCota: 'Elimina questa quota',
  },
};
