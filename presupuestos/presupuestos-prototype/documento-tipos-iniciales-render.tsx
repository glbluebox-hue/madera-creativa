import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { registrarTipoRender, obtenerTipoRender, type RenderElementoProps, type PanelPropiedadesProps } from './documento-registro-tipos-render.js';
import editorStyles from './editor-documento.module.css';

/**
 * Adaptadores de render de los siete tipos del Incremento 1, ahora con su
 * contraparte visual (Incremento 2). Registrados por efecto secundario —
 * importado una sola vez desde `editor-documento.tsx`. Añadir un tipo
 * catorce es registrar una entrada más aquí (o en un archivo nuevo),
 * nunca tocar `editor-documento.tsx` (Regla de Oro 6).
 */

// ── Texto ────────────────────────────────────────────────────────────────────────

type EstiloTexto = {
  fontFamily?: string; fontSize?: number; fontWeight?: string | number; fontStyle?: string;
  textDecoration?: string; color?: string; textAlign?: string; lineHeight?: number; letterSpacing?: number;
};

/**
 * Etiquetas permitidas dentro de un bloque de texto enriquecido (negrita/
 * cursiva/subrayado por SELECCIÓN, pedido real 28/08/2026 — antes solo se
 * podía aplicar formato a la caja entera, nunca a una palabra suelta).
 * Solo formato de carácter, nunca atributos — cualquier etiqueta que no
 * esté en esta lista se elimina entera (conservando su texto), y las que
 * sí se permiten pierden TODOS sus atributos (nunca `style=`/`onerror=`/
 * clases). El servidor vuelve a sanitizar de forma independiente
 * (`documento-tipos-iniciales.ts`, backend) — este saneado del cliente es
 * una comodidad de edición, nunca la única defensa: este contenido puede
 * acabar renderizado en el Portal del cliente, sin sesión.
 */
const ETIQUETAS_TEXTO_PERMITIDAS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR']);

function limpiarNodoTexto(nodo: Node): void {
  for (const hijo of Array.from(nodo.childNodes)) {
    if (hijo.nodeType === Node.TEXT_NODE) continue;
    if (hijo.nodeType !== Node.ELEMENT_NODE) { nodo.removeChild(hijo); continue; }
    const el = hijo as HTMLElement;
    if (!ETIQUETAS_TEXTO_PERMITIDAS.has(el.tagName)) {
      while (el.firstChild) nodo.insertBefore(el.firstChild, el);
      nodo.removeChild(el);
      continue;
    }
    while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
    limpiarNodoTexto(el);
  }
}

function sanitizarHtmlTexto(html: string): string {
  const contenedor = document.createElement('div');
  contenedor.innerHTML = html;
  limpiarNodoTexto(contenedor);
  return contenedor.innerHTML;
}

/** Convierte texto plano (documentos antiguos, sin `textoHtml` todavía) en HTML seguro — nunca lo interpreta como marcado, solo escapa `< > &` para que se vea exactamente igual que antes. */
function escaparHtmlPlano(texto: string): string {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function RenderTexto({ elemento, editando, onCambiarContenido, onSalirEdicion }: RenderElementoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const estilo = elemento.estilo as EstiloTexto;
  const texto = (elemento.contenido.texto as string) ?? '';
  const textoHtml = elemento.contenido.textoHtml as string | undefined;
  const htmlAMostrar = textoHtml !== undefined ? textoHtml : escaparHtmlPlano(texto);

  /**
   * Bug real, 28/08/2026: escribir `dangerouslySetInnerHTML` como prop de
   * JSX hace que REACT reescriba el HTML del nodo en CUALQUIER repintado
   * de este componente, no solo cuando el contenido cambia de verdad — a
   * diferencia de un `children` de texto normal, React no compara si el
   * HTML resultante es distinto, así que un repintado disparado por
   * cualquier otro estado del editor (mover el ratón, seleccionar algo)
   * mientras el usuario seguía escribiendo/con texto seleccionado
   * BORRABA en el DOM real el formato recién aplicado (negrita) antes de
   * que `onBlur` llegara a leerlo, y además interrumpía el cursor/la
   * selección a mitad de un clic ("cuesta mucho entrar a escribir").
   * Arreglo: escribir el HTML a mano en un efecto, y solo cuando el
   * contenido guardado cambia de verdad — nunca en cada render, igual
   * que React ya hacía "gratis" con el `{texto}` de antes.
   */
  useLayoutEffect(() => {
    if (ref.current && ref.current.innerHTML !== htmlAMostrar) {
      ref.current.innerHTML = htmlAMostrar;
    }
  }, [htmlAMostrar]);

  return (
    <div
      ref={ref}
      contentEditable={editando}
      suppressContentEditableWarning
      onBlur={() => {
        // Deliberadamente SIN comprobar `editando` aquí (bug real,
        // 28/08/2026): si algo fuera de este componente ya cambió
        // `editandoId` a mano antes de que este blur nativo llegara a
        // dispararse, `editando` cerraría sobre el valor viejo y el
        // guardado se saltaría en silencio, perdiendo el formato recién
        // aplicado. Guardar SIEMPRE que haya un nodo real es seguro: si
        // no había nada editado de verdad, guarda exactamente lo mismo
        // que ya estaba.
        if (!ref.current) return;
        onCambiarContenido({ texto: ref.current.innerText, textoHtml: sanitizarHtmlTexto(ref.current.innerHTML) });
        onSalirEdicion();
      }}
      style={{
        width: '100%', height: '100%', outline: 'none', cursor: editando ? 'text' : 'inherit',
        fontFamily: estilo.fontFamily ?? 'Arial', fontSize: `${estilo.fontSize ?? 16}px`,
        fontWeight: estilo.fontWeight ?? 'normal', fontStyle: estilo.fontStyle ?? 'normal',
        textDecoration: estilo.textDecoration ?? 'none', color: estilo.color ?? '#18140f',
        textAlign: (estilo.textAlign as any) ?? 'left', lineHeight: estilo.lineHeight ?? 1.2,
        letterSpacing: `${estilo.letterSpacing ?? 0}px`, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
    />
  );
}

/**
 * true si hay una selección de texto real (no colapsada) dentro de una
 * caja de texto en edición — distingue "el usuario ha marcado una
 * palabra/frase" de "solo tiene el cursor puesto" o "no está editando
 * texto en absoluto" (p. ej. tiene el elemento completo seleccionado
 * como objeto del lienzo).
 */
function haySeleccionDeTextoActiva(): boolean {
  const seleccion = window.getSelection();
  if (!seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) return false;
  const nodo = seleccion.anchorNode;
  const elementoAncla = nodo instanceof Element ? nodo : nodo?.parentElement;
  return !!elementoAncla?.closest('[contenteditable="true"]');
}

/**
 * Negrita/cursiva/subrayado por SELECCIÓN (pedido real, 28/08/2026): si
 * hay una parte del texto realmente marcada dentro de la caja en edición,
 * el formato se aplica SOLO a esa selección vía `execCommand` (API del
 * navegador ya obsoleta formalmente, pero todavía soportada en todos los
 * navegadores modernos y la única forma práctica de aplicar
 * negrita/cursiva/subrayado a una selección dentro de un contentEditable
 * sin construir un editor de texto enriquecido completo). Si no hay nada
 * seleccionado (o el elemento solo está seleccionado como objeto del
 * lienzo, sin estar editando texto), cae al comportamiento de siempre:
 * cambia el estilo de toda la caja.
 */
function aplicarFormatoCaracter(comando: 'bold' | 'italic' | 'underline', aplicarATodaLaCaja: () => void): void {
  if (haySeleccionDeTextoActiva()) {
    // Fuerza que el navegador use etiquetas semánticas (<b>/<i>/<u>) en vez
    // de `<span style="...">` — sin esto, algunos navegadores producen
    // estilos en línea que el saneado (lista blanca de etiquetas, nunca de
    // atributos) descartaría por completo, perdiendo el formato recién
    // aplicado en cuanto se guarda.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(comando);
    return;
  }
  aplicarATodaLaCaja();
}

function PanelTexto({ elemento, onCambiarEstilo }: PanelPropiedadesProps) {
  const estilo = elemento.estilo as EstiloTexto;
  const negrita = estilo.fontWeight === 'bold' || Number(estilo.fontWeight) >= 700;
  const cursiva = estilo.fontStyle === 'italic';
  const subrayado = estilo.textDecoration === 'underline';
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Fuente
        <select value={estilo.fontFamily ?? 'Arial'} onChange={(e) => onCambiarEstilo({ fontFamily: e.target.value })}>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="'Courier New'">Courier New</option>
          <option value="Verdana">Verdana</option>
          <option value="'Times New Roman'">Times New Roman</option>
        </select>
      </label>
      <label className={editorStyles.panelCampo}>
        Tamaño
        <input type="number" min={6} max={200} value={estilo.fontSize ?? 16} onChange={(e) => { if (e.target.value.trim() === '') return; const v = Number(e.target.value); if (Number.isFinite(v) && v >= 6) onCambiarEstilo({ fontSize: v }); }} />
      </label>
      <div className={editorStyles.panelFila}>
        <button
          type="button"
          className={negrita ? editorStyles.toggleActivo : editorStyles.toggle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicarFormatoCaracter('bold', () => onCambiarEstilo({ fontWeight: negrita ? 'normal' : 'bold' }))}
        ><b>N</b></button>
        <button
          type="button"
          className={cursiva ? editorStyles.toggleActivo : editorStyles.toggle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicarFormatoCaracter('italic', () => onCambiarEstilo({ fontStyle: cursiva ? 'normal' : 'italic' }))}
        ><i>K</i></button>
        <button
          type="button"
          className={subrayado ? editorStyles.toggleActivo : editorStyles.toggle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicarFormatoCaracter('underline', () => onCambiarEstilo({ textDecoration: subrayado ? 'none' : 'underline' }))}
        ><u>S</u></button>
      </div>
      <div className={editorStyles.panelFila}>
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <button key={a} type="button" className={estilo.textAlign === a ? editorStyles.toggleActivo : editorStyles.toggle} onClick={() => onCambiarEstilo({ textAlign: a })}>
            {a === 'left' ? 'Izq' : a === 'center' ? 'Cen' : a === 'right' ? 'Der' : 'Just'}
          </button>
        ))}
      </div>
      <label className={editorStyles.panelCampo}>
        Color
        <input type="color" value={estilo.color ?? '#18140f'} onChange={(e) => onCambiarEstilo({ color: e.target.value })} />
      </label>
    </div>
  );
}

registrarTipoRender({
  tipo: 'texto', etiqueta: 'Texto', insertableDesdeBarra: true, editableEnLienzo: true,
  tamanoInicial: { ancho: 220, alto: 40 },
  crearContenidoInicial: () => ({ texto: 'Texto' }),
  crearEstiloInicial: () => ({ fontFamily: 'Arial', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', color: '#18140f', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0 }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderTexto, PanelPropiedades: PanelTexto,
});

// ── Imagen ───────────────────────────────────────────────────────────────────────

function useSustituirArchivo(onSustituirArchivo?: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  return {
    inputRef,
    abrir: () => inputRef.current?.click(),
    onChange: async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onSustituirArchivo) onSustituirArchivo(file);
      e.target.value = '';
    },
  };
}

function RenderImagen({ elemento }: RenderElementoProps) {
  const url = elemento.contenido.url as string;
  const bordeRadio = (elemento.propiedadesEspecificas.bordeRadio as number) ?? 0;
  return url
    ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: bordeRadio, pointerEvents: 'none' }} />
    : <div className={editorStyles.marcadorVacio}>Imagen</div>;
}

function PanelImagen({ elemento, onCambiarPropiedades, onSustituirArchivo, onElegirDeBiblioteca, onSubirABiblioteca }: PanelPropiedadesProps) {
  const { inputRef, abrir, onChange } = useSustituirArchivo(onSustituirArchivo);
  const biblioteca = useSustituirArchivo(onSubirABiblioteca);
  const bordeRadio = (elemento.propiedadesEspecificas.bordeRadio as number) ?? 0;
  return (
    <div className={editorStyles.panelSeccion}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onChange} />
      <input ref={biblioteca.inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={biblioteca.onChange} />
      <button type="button" className={editorStyles.btnPanel} onClick={abrir}>Subir imagen</button>
      {onSubirABiblioteca && <button type="button" className={editorStyles.btnPanel} onClick={biblioteca.abrir}>Subir a la biblioteca</button>}
      {onElegirDeBiblioteca && <button type="button" className={editorStyles.btnPanel} onClick={onElegirDeBiblioteca}>Elegir de la biblioteca</button>}
      <label className={editorStyles.panelCampo}>
        Borde redondeado
        <input type="range" min={0} max={100} value={bordeRadio} onChange={(e) => onCambiarPropiedades({ bordeRadio: Number(e.target.value) })} />
      </label>
    </div>
  );
}

registrarTipoRender({
  tipo: 'imagen', etiqueta: 'Imagen', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 200, alto: 150 },
  crearContenidoInicial: () => ({ url: '', recorte: null }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({ bordeRadio: 0 }),
  Render: RenderImagen, PanelPropiedades: PanelImagen,
});

// ── Logotipo ─────────────────────────────────────────────────────────────────────

function RenderLogotipo({ elemento }: RenderElementoProps) {
  const url = elemento.contenido.url as string;
  return url
    ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
    : <div className={editorStyles.marcadorVacio}>Logo</div>;
}

function PanelLogotipo({ elemento, onCambiarContenido, onSustituirArchivo, onElegirDeBiblioteca }: PanelPropiedadesProps) {
  const { inputRef, abrir, onChange } = useSustituirArchivo(onSustituirArchivo);
  const modo = (elemento.contenido.modo as string) ?? 'vinculado';
  return (
    <div className={editorStyles.panelSeccion}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onChange} />
      <label className={editorStyles.panelCampo}>
        Origen
        <select value={modo} onChange={(e) => onCambiarContenido({ modo: e.target.value })}>
          <option value="vinculado">Vinculado al logo de la empresa</option>
          <option value="fijo">Fijo para este documento</option>
        </select>
      </label>
      {/* En modo "vinculado" este botón sube el archivo directamente al logo
          de Empresa (mismo destino que "Ajustes de empresa" — ver
          `sustituirArchivoDe` en editor-documento.tsx), nunca a una copia
          propia de este elemento: cambiar el logo aquí cambia el logo en
          toda la aplicación, exactamente igual que hacerlo desde Ajustes. */}
      {modo === 'vinculado' && <button type="button" className={editorStyles.btnPanel} onClick={abrir}>Cambiar logo de la empresa</button>}
      {modo === 'fijo' && <button type="button" className={editorStyles.btnPanel} onClick={abrir}>Sustituir imagen</button>}
      {modo === 'fijo' && onElegirDeBiblioteca && <button type="button" className={editorStyles.btnPanel} onClick={onElegirDeBiblioteca}>Elegir de la biblioteca</button>}
    </div>
  );
}

registrarTipoRender({
  tipo: 'logotipo', etiqueta: 'Logo', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 140, alto: 80 },
  crearContenidoInicial: () => ({ modo: 'vinculado', url: '' }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderLogotipo, PanelPropiedades: PanelLogotipo,
});

// ── Firma de la empresa ──────────────────────────────────────────────────────────
// Petición explícita del usuario, 26/08/2026: dibuja su firma UNA VEZ en
// Ajustes de empresa y quiere que salga sola en cada presupuesto, igual
// que el logo. Mismo patrón que "logotipo" (vinculado/fijo); a diferencia
// de él, el modo 'vinculado' no ofrece cambiarla desde aquí (se dibuja
// con `FirmaCanvas`, no se sube un archivo) — solo desde Ajustes de empresa.

function RenderFirmaEmpresa({ elemento }: RenderElementoProps) {
  const url = elemento.contenido.url as string;
  return url
    ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
    : <div className={editorStyles.marcadorVacio}>Firma</div>;
}

function PanelFirmaEmpresa({ elemento, onCambiarContenido, onSustituirArchivo }: PanelPropiedadesProps) {
  const { inputRef, abrir, onChange } = useSustituirArchivo(onSustituirArchivo);
  const modo = (elemento.contenido.modo as string) ?? 'vinculado';
  return (
    <div className={editorStyles.panelSeccion}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onChange} />
      <label className={editorStyles.panelCampo}>
        Origen
        <select value={modo} onChange={(e) => onCambiarContenido({ modo: e.target.value })}>
          <option value="vinculado">Vinculada a la firma de la empresa</option>
          <option value="fijo">Fija para este documento</option>
        </select>
      </label>
      {modo === 'vinculado' && (
        <p style={{ fontSize: '0.75rem', color: 'var(--topo-claro)', margin: 0 }}>
          Se rellena sola con la firma guardada en Ajustes de empresa. Para cambiarla, ve a Ajustes de empresa.
        </p>
      )}
      {modo === 'fijo' && <button type="button" className={editorStyles.btnPanel} onClick={abrir}>Sustituir imagen</button>}
    </div>
  );
}

registrarTipoRender({
  tipo: 'firma_empresa', etiqueta: 'Firma de la empresa', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 160, alto: 70 },
  crearContenidoInicial: () => ({ modo: 'vinculado', url: '' }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderFirmaEmpresa, PanelPropiedades: PanelFirmaEmpresa,
});

// ── Firma del cliente ────────────────────────────────────────────────────────────
// Petición explícita del usuario, 26/08/2026: cuando el cliente acepta y
// firma desde el Portal, su firma real (y la fecha exacta de aceptación —
// puede ser días después de enviarse el presupuesto) debe aparecer EN EL
// SITIO del documento donde el carpintero puso este elemento, no solo en
// el aviso aparte de debajo. Siempre vinculado — no tiene "fijo".

function RenderFirmaCliente({ elemento }: RenderElementoProps) {
  const url = (elemento.contenido.url as string) || '';
  const fecha = (elemento.contenido.fecha as string) || '';
  if (!url) return <div className={editorStyles.marcadorVacio}>Firma del cliente</div>;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <img src={url} alt="Firma del cliente" draggable={false} style={{ maxWidth: '100%', flex: 1, minHeight: 0, objectFit: 'contain', pointerEvents: 'none' }} />
      {fecha && <span style={{ fontSize: '0.68rem', color: '#8a7f6f', fontWeight: 600, flexShrink: 0 }}>{fecha}</span>}
    </div>
  );
}

function PanelFirmaCliente() {
  return (
    <div className={editorStyles.panelSeccion}>
      <p style={{ fontSize: '0.78rem', color: 'var(--topo-claro)', margin: 0 }}>
        Se rellena sola con la firma real del cliente y la fecha en que acepte el presupuesto desde el Portal. Mientras tanto se ve vacío.
      </p>
    </div>
  );
}

registrarTipoRender({
  tipo: 'firma_cliente', etiqueta: 'Firma del cliente', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 200, alto: 90 },
  crearContenidoInicial: () => ({ url: '', fecha: '' }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderFirmaCliente, PanelPropiedades: PanelFirmaCliente,
});

// ── Línea ────────────────────────────────────────────────────────────────────────

type EstiloLinea = { color?: string; grosor?: number; patron?: string };

function RenderLinea({ elemento }: RenderElementoProps) {
  const estilo = elemento.estilo as EstiloLinea;
  const { ancho, alto } = elemento.tamano;
  // Siempre centrada verticalmente en su propia caja (nunca pegada al
  // borde superior) — antes, para cajas finas (alto<=2, el caso normal de
  // una regla horizontal) el trazo se dibujaba tan al borde que dependía
  // de desbordarse fuera de la caja para verse completo; desde que el
  // contenido se recorta a su caja (`overflow:hidden` en `.elemento`,
  // Motor Documental) ese desbordamiento ya no se ve, y la línea
  // desaparecía casi del todo (fallo real reportado por el usuario). Con
  // el trazo centrado y una caja con margen de sobra (ver `lineaEl` donde
  // se crean estas líneas) el trazo cabe entero sin depender de desbordar nada.
  return (
    <svg width="100%" height="100%" style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <line
        x1={0} y1={alto / 2} x2={ancho} y2={alto / 2}
        stroke={estilo.color ?? '#51483f'} strokeWidth={estilo.grosor ?? 1}
        strokeDasharray={estilo.patron === 'discontinuo' ? '6 4' : undefined}
      />
    </svg>
  );
}

function PanelLinea({ elemento, onCambiarEstilo }: PanelPropiedadesProps) {
  const estilo = elemento.estilo as EstiloLinea;
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Color
        <input type="color" value={estilo.color ?? '#51483f'} onChange={(e) => onCambiarEstilo({ color: e.target.value })} />
      </label>
      <label className={editorStyles.panelCampo}>
        Grosor
        <input type="number" min={1} max={20} value={estilo.grosor ?? 1} onChange={(e) => { if (e.target.value.trim() === '') return; const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1) onCambiarEstilo({ grosor: v }); }} />
      </label>
      <label className={editorStyles.panelCampo}>
        Patrón
        <select value={estilo.patron ?? 'solido'} onChange={(e) => onCambiarEstilo({ patron: e.target.value })}>
          <option value="solido">Sólido</option>
          <option value="discontinuo">Discontinuo</option>
        </select>
      </label>
    </div>
  );
}

registrarTipoRender({
  tipo: 'linea', etiqueta: 'Línea', insertableDesdeBarra: true, editableEnLienzo: false,
  // alto con margen de sobra (no 2px exactos) para que el trazo, ya
  // centrado en su caja, quepa entero sin depender de desbordarse fuera
  // de ella (ver nota en RenderLinea).
  tamanoInicial: { ancho: 200, alto: 8 },
  crearContenidoInicial: () => ({ puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
  crearEstiloInicial: () => ({ color: '#51483f', grosor: 1, patron: 'solido' }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderLinea, PanelPropiedades: PanelLinea,
});

// ── Rectángulo ───────────────────────────────────────────────────────────────────

type EstiloRectangulo = { relleno?: string; trazoColor?: string; trazoAncho?: number; bordeRadio?: number };

/**
 * Interpreta el texto escrito en el campo de grosor: `null` cuando todavía
 * no representa un número aplicable (vacío, mientras el usuario borra para
 * escribir otro valor, o algo no numérico/negativo) — en ese caso no se
 * debe tocar el documento, solo dejar que el borrador local del campo
 * quede así hasta la siguiente pulsación o hasta perder el foco.
 */
export function parsearGrosorBorde(texto: string): number | null {
  if (texto.trim() === '') return null;
  const v = Number(texto);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function RenderRectangulo({ elemento }: RenderElementoProps) {
  const estilo = elemento.estilo as EstiloRectangulo;
  const bordeRadio = estilo.bordeRadio ?? 0;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/*
        Dos capas separadas — petición del usuario, 24/08/2026: "las líneas
        siempre se quedan de la misma... el interior sí tiene que seguir el
        comando opacidad". La opacidad de CSS afecta siempre a TODO el
        subárbol de quien la lleva, sin excepción — no hay forma de que un
        único `<div>` con relleno+borde tenga cada uno una opacidad
        distinta. Por eso el relleno vive en su propia capa (con la
        opacidad del elemento) y el borde en otra por encima (siempre a
        opacidad 1) — el wrapper `.elemento` de `editor-documento.tsx`/
        `visor-documento.tsx` deja de aplicar su propia `opacity` a los
        rectángulos precisamente para no volver a afectar al borde desde
        fuera.
      */}
      <div style={{
        position: 'absolute', inset: 0,
        boxSizing: 'border-box',
        background: estilo.relleno ?? 'transparent',
        borderRadius: bordeRadio,
        opacity: elemento.opacidad,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        // Ver nota en el commit anterior: `border-box` es necesario para que
        // el borde no se salga del hueco del padre (`.elemento`, con
        // `overflow: hidden`) y se recorte en el lado derecho/inferior.
        boxSizing: 'border-box',
        border: `${estilo.trazoAncho ?? 0}px solid ${estilo.trazoColor ?? 'transparent'}`,
        borderRadius: bordeRadio,
      }} />
    </div>
  );
}

function PanelRectangulo({ elemento, onCambiarEstilo }: PanelPropiedadesProps) {
  const estilo = elemento.estilo as EstiloRectangulo;
  const trazoActual = estilo.trazoAncho ?? 0;
  /**
   * Campo de grosor con borrador de texto local — corrección 24/08/2026.
   * Causa raíz del bug real: el `<input>` estaba controlado DIRECTAMENTE
   * por `estilo.trazoAncho` (el valor ya confirmado en el documento). Al
   * borrar el "0" para escribir otro número, el campo pasaba a estar
   * vacío en el DOM sin que React lo supiera (el `onChange` no llamaba a
   * `onCambiarEstilo` mientras el texto estuviera vacío, así que el estado
   * de React seguía en 0). En cuanto CUALQUIER otra parte del editor volvía
   * a renderizar entre pulsación y pulsación (autoguardado, recálculo de
   * la barra flotante al mover el ratón, cambio de zoom...), React
   * reconciliaba el input contra su `value` de siempre (0) y lo devolvía a
   * "0" a mitad de la edición, antes de que el usuario llegara a teclear
   * el dígito nuevo — parecía que el campo "no dejaba" sustituir el 0.
   * Con un borrador de texto propio, el campo deja de depender del resto
   * del árbol de renders mientras se está editando.
   */
  const [borradorGrosor, setBorradorGrosor] = useState(String(trazoActual));
  const editandoGrosorRef = useRef(false);
  // Selección de otro elemento: reinicia el borrador (y cualquier edición
  // en curso deja de ser válida, ya no aplica a este elemento).
  useEffect(() => {
    editandoGrosorRef.current = false;
    setBorradorGrosor(String(trazoActual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elemento.id]);
  // Cambios externos al valor (undo/redo, etc.) mientras NO se está
  // editando el campo — si se está editando, no se toca para no pisar lo
  // que el usuario está escribiendo.
  useEffect(() => {
    if (!editandoGrosorRef.current) setBorradorGrosor(String(trazoActual));
  }, [trazoActual]);
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Relleno
        <input type="color" value={estilo.relleno && estilo.relleno !== 'transparent' ? estilo.relleno : '#ffffff'} onChange={(e) => onCambiarEstilo({ relleno: e.target.value })} />
      </label>
      <label className={editorStyles.panelCampo}>
        Color de borde
        <input type="color" value={estilo.trazoColor && estilo.trazoColor !== 'transparent' ? estilo.trazoColor : '#000000'} onChange={(e) => onCambiarEstilo({ trazoColor: e.target.value })} />
      </label>
      <label className={editorStyles.panelCampo}>
        Grosor de borde
        <input
          type="number" min={0} max={20}
          value={borradorGrosor}
          onFocus={() => { editandoGrosorRef.current = true; }}
          onChange={(e) => {
            const texto = e.target.value;
            setBorradorGrosor(texto);
            const v = parsearGrosorBorde(texto);
            if (v !== null) onCambiarEstilo({ trazoAncho: v }); // vacío/inválido: se deja el borrador tal cual, sin tocar el documento
          }}
          onBlur={() => {
            editandoGrosorRef.current = false;
            // Si se sale del campo vacío o con algo no válido, vuelve al último valor confirmado — nunca se queda "colgado".
            if (parsearGrosorBorde(borradorGrosor) === null) setBorradorGrosor(String(trazoActual));
          }}
        />
      </label>
      <label className={editorStyles.panelCampo}>
        Borde redondeado
        <input type="range" min={0} max={100} value={estilo.bordeRadio ?? 0} onChange={(e) => onCambiarEstilo({ bordeRadio: Number(e.target.value) })} />
      </label>
    </div>
  );
}

registrarTipoRender({
  tipo: 'rectangulo', etiqueta: 'Rectángulo', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 160, alto: 100 },
  crearContenidoInicial: () => ({}),
  // Grosor inicial visible (1px) + color de borde negro — antes el grosor
  // era 0 y el color 'transparent', así que ni arreglando el input del
  // grosor se veía ningún borde: 1px de un color transparente sigue
  // siendo invisible (corrección 24/08/2026, reportado con captura: "yo
  // cuando quito el rectángulo de edición no se quedan líneas alrededor").
  // Un rectángulo recién creado ahora se ve de inmediato, con una línea
  // igual que el resto de separadores del documento (p. ej. la de
  // "condiciones de pago"). El usuario sigue pudiendo cambiar el color o
  // ponerlo en transparente desde el panel si no quiere borde.
  crearEstiloInicial: () => ({ relleno: '#f5ede0', trazoColor: '#000000', trazoAncho: 1, bordeRadio: 0 }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderRectangulo, PanelPropiedades: PanelRectangulo,
});

// ── Archivo adjunto ──────────────────────────────────────────────────────────────

function RenderArchivoAdjunto({ elemento }: RenderElementoProps) {
  const nombre = (elemento.contenido.nombre as string) || 'Archivo';
  return (
    <div className={editorStyles.chipArchivo}>
      <span>📎</span>
      <span>{nombre}</span>
    </div>
  );
}

function PanelArchivoAdjunto({ elemento, onSustituirArchivo }: PanelPropiedadesProps) {
  const { inputRef, abrir, onChange } = useSustituirArchivo(onSustituirArchivo);
  return (
    <div className={editorStyles.panelSeccion}>
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onChange} />
      <button type="button" className={editorStyles.btnPanel} onClick={abrir}>Sustituir archivo</button>
      <p className={editorStyles.panelNota}>{(elemento.contenido.nombre as string) || 'Sin archivo'}</p>
    </div>
  );
}

registrarTipoRender({
  tipo: 'archivoAdjunto', etiqueta: 'Adjunto', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 160, alto: 40 },
  crearContenidoInicial: () => ({ nombre: '', url: '', mimeType: '', tamano: 0 }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderArchivoAdjunto, PanelPropiedades: PanelArchivoAdjunto,
});

// ── Precio destacado ─────────────────────────────────────────────────────────────

type EstiloPrecio = { colorFondo?: string; colorTexto?: string };

function RenderPrecioDestacado({ elemento }: RenderElementoProps) {
  const estilo = elemento.estilo as EstiloPrecio;
  const valor = (elemento.contenido.valor as string) || '';
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: estilo.colorFondo ?? '#f5ede0', color: estilo.colorTexto ?? '#8a6835',
      fontWeight: 800, fontSize: '1.1rem', borderRadius: 6,
    }}>
      {valor}
    </div>
  );
}

function PanelPrecioDestacado({ elemento, onCambiarContenido, onCambiarEstilo, precioTotal, onCambiarPrecioTotal }: PanelPropiedadesProps) {
  const modo = (elemento.contenido.modo as string) ?? 'vinculado';
  const estilo = elemento.estilo as EstiloPrecio;
  return (
    <div className={editorStyles.panelSeccion}>
      {onCambiarPrecioTotal && (
        <label className={editorStyles.panelCampo} style={{ background: '#eaf3ee', padding: '0.5rem', borderRadius: 6, border: '1px solid #3d7a52' }}>
          <span style={{ fontWeight: 700 }}>💶 Precio total del presupuesto (el precio real)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={precioTotal ?? 0}
            onChange={(e) => {
              if (e.target.value.trim() === '') return;
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0) onCambiarPrecioTotal(v);
            }}
          />
          <span className={editorStyles.panelNota}>Esto es lo único que cambia el precio real del presupuesto — se ve en la lista de "Presupuestos" y en Inteligencia de Precios. El campo "Texto" de abajo NO lo cambia, solo decora esta insignia.</span>
        </label>
      )}
      <label className={editorStyles.panelCampo}>
        Origen de esta insignia (solo visual)
        <select value={modo} onChange={(e) => onCambiarContenido({ modo: e.target.value })}>
          <option value="vinculado">Mostrar el precio total (arriba)</option>
          <option value="fijo">Mostrar un texto fijo, a mano</option>
        </select>
      </label>
      {modo === 'fijo' && (
        <label className={editorStyles.panelCampo}>
          Texto de la insignia (decorativo)
          <input type="text" value={(elemento.contenido.valor as string) ?? ''} onChange={(e) => onCambiarContenido({ valor: e.target.value })} />
          <span className={editorStyles.panelNota}>Solo cambia lo que se VE aquí — usa el campo verde de arriba para cambiar el precio real del presupuesto.</span>
        </label>
      )}
      <label className={editorStyles.panelCampo}>
        Color de fondo
        <input type="color" value={estilo.colorFondo ?? '#f5ede0'} onChange={(e) => onCambiarEstilo({ colorFondo: e.target.value })} />
      </label>
      <label className={editorStyles.panelCampo}>
        Color de texto
        <input type="color" value={estilo.colorTexto ?? '#8a6835'} onChange={(e) => onCambiarEstilo({ colorTexto: e.target.value })} />
      </label>
    </div>
  );
}

registrarTipoRender({
  tipo: 'precioDestacado', etiqueta: 'Precio', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 180, alto: 60 },
  crearContenidoInicial: () => ({ modo: 'vinculado', valor: '' }),
  crearEstiloInicial: () => ({ colorFondo: '#f5ede0', colorTexto: '#8a6835' }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderPrecioDestacado, PanelPropiedades: PanelPrecioDestacado,
});

// ── Instancia de componente (Incremento 6) ──────────────────────────────────────
// No es insertable desde la barra — se inserta explícitamente al elegir un
// componente de la biblioteca (ver editor-documento.tsx), nunca "en blanco".

function RenderInstanciaComponente({ elemento, resolverComponente }: RenderElementoProps) {
  const componenteId = elemento.contenido.componenteId as string;
  const componente = resolverComponente?.(componenteId);
  if (!componente) return <div className={editorStyles.marcadorVacio}>Cargando componente…</div>;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {componente.elementos.map((hijo) => {
        const definicionHijo = obtenerTipoRender(hijo.tipo);
        return (
          <div
            key={hijo.id}
            style={{
              position: 'absolute', left: hijo.posicion.x, top: hijo.posicion.y,
              width: hijo.tamano.ancho, height: hijo.tamano.alto,
              transform: `rotate(${hijo.rotacion}deg)`, opacity: hijo.opacidad,
            }}
          >
            <definicionHijo.Render elemento={hijo} editando={false} onCambiarContenido={() => {}} onSalirEdicion={() => {}} />
          </div>
        );
      })}
    </div>
  );
}

function PanelInstanciaComponente({ elemento }: PanelPropiedadesProps) {
  return <p className={editorStyles.panelNota}>Instancia vinculada de la biblioteca — usa "Desvincular" en la barra de herramientas para poder editar sus elementos directamente.</p>;
}

registrarTipoRender({
  tipo: 'instanciaComponente', etiqueta: 'Componente', insertableDesdeBarra: false, editableEnLienzo: false,
  tamanoInicial: { ancho: 200, alto: 100 },
  crearContenidoInicial: () => ({ componenteId: '', version: 1, overridesLocales: {} }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderInstanciaComponente, PanelPropiedades: PanelInstanciaComponente,
});
