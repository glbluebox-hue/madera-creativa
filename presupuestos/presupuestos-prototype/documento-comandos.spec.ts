import {
  crearElementoBase,
  anadirElemento,
  eliminarElementos,
  moverElementos,
  redimensionarElemento,
  rotarElemento,
  establecerOpacidad,
  establecerVisibilidad,
  establecerSoloLectura,
  establecerObligatorio,
  actualizarContenido,
  actualizarEstilo,
  duplicarElementos,
  agruparElementos,
  desagruparElementos,
  idsDelGrupo,
  establecerBloqueo,
  cambiarCapa,
  alinear,
  distribuir,
  anadirPagina,
  eliminarPagina,
  establecerFondoPagina,
  localizarElemento,
  crearEstiloNombrado,
  actualizarEstiloNombrado,
  eliminarEstiloNombrado,
  aplicarEstiloNombrado,
  resolverEstiloEfectivo,
  establecerTema,
  crearElementoInstanciaComponente,
  desvincularInstancia,
} from './documento-comandos.js';
import type { DocumentoMC } from './documento-modelo.js';

function documentoVacio(): DocumentoMC {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    documentoBaseId: null,
    etiquetaVersion: null,
    documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{
      id: 'pag-1', indice: 0, nombre: '', configuracion: null, fondo: null,
      encabezado: null, pie: null, numeracion: { mostrar: false, formato: '', posicion: 'centro' }, elementos: [],
    }],
    configuracionPorDefecto: { ancho: 794, alto: 1123, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' },
    encabezadoPorDefecto: null,
    piePorDefecto: null,
    variables: { claves: {} },
    configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null,
    estilosGuardados: [],
  };
}

function conElementos(...tamPos: Array<{ x: number; y: number; ancho: number; alto: number }>): DocumentoMC {
  let doc = documentoVacio();
  for (const { x, y, ancho, alto } of tamPos) {
    const el = crearElementoBase('texto', { x, y }, { ancho, alto });
    doc = anadirElemento(doc, 'pag-1', el);
  }
  return doc;
}

describe('documento-comandos — pureza e inmutabilidad', () => {
  it('ningún comando muta el documento original', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const original = structuredClone(doc);
    const id = doc.paginas[0].elementos[0].id;
    moverElementos(doc, [id], 5, 5);
    redimensionarElemento(doc, id, { ancho: 20, alto: 20 });
    rotarElemento(doc, id, 45);
    eliminarElementos(doc, [id]);
    expect(doc).toEqual(original);
  });
});

describe('anadirElemento / eliminarElementos', () => {
  it('añade el elemento a la página y asigna la capa siguiente a la más alta', () => {
    let doc = documentoVacio();
    const e1 = crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 10, alto: 10 });
    const e2 = crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 10, alto: 10 });
    doc = anadirElemento(doc, 'pag-1', e1);
    doc = anadirElemento(doc, 'pag-1', e2);
    expect(doc.paginas[0].elementos).toHaveLength(2);
    expect(doc.paginas[0].elementos[1].capa).toBe(doc.paginas[0].elementos[0].capa + 1);
  });

  it('elimina el elemento indicado y no toca los demás', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 20, ancho: 10, alto: 10 });
    const idBorrar = doc.paginas[0].elementos[0].id;
    const idQueda = doc.paginas[0].elementos[1].id;
    const resultado = eliminarElementos(doc, [idBorrar]);
    expect(resultado.paginas[0].elementos).toHaveLength(1);
    expect(resultado.paginas[0].elementos[0].id).toBe(idQueda);
  });
});

describe('mover / redimensionar / rotar', () => {
  it('mueve por delta y respeta bloqueado', () => {
    let doc = conElementos({ x: 10, y: 10, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    doc = establecerBloqueo(doc, [id], true);
    const movido = moverElementos(doc, [id], 5, 5);
    expect(movido.paginas[0].elementos[0].posicion).toEqual({ x: 10, y: 10 }); // bloqueado, no se mueve

    const desbloqueado = establecerBloqueo(doc, [id], false);
    const movido2 = moverElementos(desbloqueado, [id], 5, 7);
    expect(movido2.paginas[0].elementos[0].posicion).toEqual({ x: 15, y: 17 });
  });

  it('redimensiona y opcionalmente reposiciona', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    const resultado = redimensionarElemento(doc, id, { ancho: 50, alto: 60 }, { x: 5, y: 5 });
    expect(resultado.paginas[0].elementos[0].tamano).toEqual({ ancho: 50, alto: 60 });
    expect(resultado.paginas[0].elementos[0].posicion).toEqual({ x: 5, y: 5 });
  });

  it('rota el elemento', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    const resultado = rotarElemento(doc, id, 90);
    expect(resultado.paginas[0].elementos[0].rotacion).toBe(90);
  });

  it('establece la opacidad y la limita a [0,1]', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    expect(establecerOpacidad(doc, id, 0.5).paginas[0].elementos[0].opacidad).toBe(0.5);
    expect(establecerOpacidad(doc, id, 5).paginas[0].elementos[0].opacidad).toBe(1);
    expect(establecerOpacidad(doc, id, -5).paginas[0].elementos[0].opacidad).toBe(0);
  });

  it('establece la visibilidad de un elemento (Incremento 8 — exportación)', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    expect(doc.paginas[0].elementos[0].restricciones.visibilidad).toBe('siempre');
    const resultado = establecerVisibilidad(doc, id, 'soloImpresion');
    expect(resultado.paginas[0].elementos[0].restricciones.visibilidad).toBe('soloImpresion');
    // el resto de restricciones no se toca
    expect(resultado.paginas[0].elementos[0].restricciones.soloLectura).toBe(false);
  });
});

describe('actualizarContenido / actualizarEstilo', () => {
  it('mezcla contenido nuevo con el existente, sin perder claves no tocadas', () => {
    let doc = documentoVacio();
    const el = { ...crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 10, alto: 10 }), contenido: { texto: 'hola', extra: 'x' } };
    doc = anadirElemento(doc, 'pag-1', el);
    const resultado = actualizarContenido(doc, el.id, { texto: 'adiós' });
    expect(resultado.paginas[0].elementos[0].contenido).toEqual({ texto: 'adiós', extra: 'x' });
  });

  it('aplica estilo a varios elementos a la vez', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 20, ancho: 10, alto: 10 });
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    const resultado = actualizarEstilo(doc, ids, { color: 'red' });
    expect(resultado.paginas[0].elementos.every((e) => e.estilo.color === 'red')).toBe(true);
  });

  it('un elemento de solo lectura ignora actualizarContenido pero admite estilo (Incremento 10 — motor de restricciones)', () => {
    let doc = documentoVacio();
    const el = { ...crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 10, alto: 10 }), contenido: { texto: 'hola' } };
    doc = anadirElemento(doc, 'pag-1', el);
    doc = establecerSoloLectura(doc, el.id, true);
    expect(doc.paginas[0].elementos[0].restricciones.soloLectura).toBe(true);

    const conIntentoDeCambio = actualizarContenido(doc, el.id, { texto: 'hackeado' });
    expect(conIntentoDeCambio.paginas[0].elementos[0].contenido).toEqual({ texto: 'hola' });

    const conEstiloNuevo = actualizarEstilo(doc, [el.id], { color: 'red' });
    expect(conEstiloNuevo.paginas[0].elementos[0].estilo.color).toBe('red');

    const conMovimiento = moverElementos(doc, [el.id], 5, 5);
    expect(conMovimiento.paginas[0].elementos[0].posicion).toEqual({ x: 5, y: 5 });
  });

  it('establece obligatorio sin afectar al resto de restricciones (Incremento 10)', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    const resultado = establecerObligatorio(doc, id, true);
    expect(resultado.paginas[0].elementos[0].restricciones.obligatorio).toBe(true);
    expect(resultado.paginas[0].elementos[0].restricciones.soloLectura).toBe(false);
    expect(resultado.paginas[0].elementos[0].restricciones.visibilidad).toBe('siempre');
  });
});

describe('duplicarElementos', () => {
  it('crea copias con ids nuevos y desplazamiento, conservando el grupo relativo', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 20, ancho: 10, alto: 10 });
    const [id1, id2] = doc.paginas[0].elementos.map((e) => e.id);
    doc = agruparElementos(doc, [id1, id2]);

    const { documento: resultado, nuevosIds } = duplicarElementos(doc, [id1, id2]);
    expect(resultado.paginas[0].elementos).toHaveLength(4);
    expect(nuevosIds).toHaveLength(2);
    expect(nuevosIds.every((id) => !doc.paginas[0].elementos.some((e) => e.id === id))).toBe(true);

    const copia1 = localizarElemento(resultado, nuevosIds[0])!.elemento;
    const copia2 = localizarElemento(resultado, nuevosIds[1])!.elemento;
    expect(copia1.grupoId).toBe(copia2.grupoId); // el nuevo grupo se comparte entre las copias
    expect(copia1.grupoId).not.toBe(localizarElemento(doc, id1)!.elemento.grupoId); // pero es un grupo distinto al original
  });
});

describe('agrupar / desagrupar', () => {
  it('agrupar asigna un grupoId común; idsDelGrupo lo recupera', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 20, ancho: 10, alto: 10 }, { x: 40, y: 40, ancho: 10, alto: 10 });
    const [id1, id2, id3] = doc.paginas[0].elementos.map((e) => e.id);
    doc = agruparElementos(doc, [id1, id2]);
    expect(idsDelGrupo(doc, id1).sort()).toEqual([id1, id2].sort());
    expect(idsDelGrupo(doc, id3)).toEqual([id3]); // no agrupado, solo él mismo
  });

  it('desagrupar limpia grupoId de todos los miembros', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 20, ancho: 10, alto: 10 });
    const [id1, id2] = doc.paginas[0].elementos.map((e) => e.id);
    doc = agruparElementos(doc, [id1, id2]);
    const grupoId = localizarElemento(doc, id1)!.elemento.grupoId!;
    doc = desagruparElementos(doc, grupoId);
    expect(doc.paginas[0].elementos.every((e) => e.grupoId === null)).toBe(true);
  });
});

describe('cambiarCapa', () => {
  it('frente/fondo llevan al elemento a los extremos; arriba/abajo lo mueven un paso', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 0, y: 0, ancho: 10, alto: 10 }, { x: 0, y: 0, ancho: 10, alto: 10 });
    const [id1, id2, id3] = doc.paginas[0].elementos.map((e) => e.id); // capas 0,1,2

    const alFondo = cambiarCapa(doc, id3, 'fondo');
    const ordenAlFondo = [...alFondo.paginas[0].elementos].sort((a, b) => a.capa - b.capa).map((e) => e.id);
    expect(ordenAlFondo[0]).toBe(id3);

    const alFrente = cambiarCapa(doc, id1, 'frente');
    const ordenAlFrente = [...alFrente.paginas[0].elementos].sort((a, b) => a.capa - b.capa).map((e) => e.id);
    expect(ordenAlFrente[ordenAlFrente.length - 1]).toBe(id1);

    const unPaso = cambiarCapa(doc, id1, 'arriba');
    const ordenUnPaso = [...unPaso.paginas[0].elementos].sort((a, b) => a.capa - b.capa).map((e) => e.id);
    expect(ordenUnPaso.indexOf(id1)).toBe(1); // id1 empezaba en 0, sube un paso a la posición 1

    void id2;
  });
});

describe('alinear', () => {
  it('alinea a la izquierda usando el mínimo x del conjunto', () => {
    const doc = conElementos({ x: 10, y: 0, ancho: 10, alto: 10 }, { x: 50, y: 30, ancho: 10, alto: 10 });
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    const resultado = alinear(doc, ids, 'izquierda');
    expect(resultado.paginas[0].elementos.every((e) => e.posicion.x === 10)).toBe(true);
  });

  it('centroH centra todos en el centro horizontal del conjunto', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 90, y: 0, ancho: 10, alto: 10 });
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    const resultado = alinear(doc, ids, 'centroH');
    const centros = resultado.paginas[0].elementos.map((e) => e.posicion.x + e.tamano.ancho / 2);
    expect(centros[0]).toBeCloseTo(centros[1], 5);
  });

  it('no hace nada con menos de dos elementos', () => {
    const doc = conElementos({ x: 10, y: 0, ancho: 10, alto: 10 });
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    const resultado = alinear(doc, ids, 'izquierda');
    expect(resultado).toEqual(doc);
  });
});

describe('distribuir', () => {
  it('espacia uniformemente tres o más elementos entre los extremos', () => {
    const doc = conElementos(
      { x: 0, y: 0, ancho: 10, alto: 10 },
      { x: 40, y: 0, ancho: 10, alto: 10 },
      { x: 100, y: 0, ancho: 10, alto: 10 }
    );
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    const resultado = distribuir(doc, ids, 'horizontal');
    const ordenados = [...resultado.paginas[0].elementos].sort((a, b) => a.posicion.x - b.posicion.x);
    const hueco1 = ordenados[1].posicion.x - (ordenados[0].posicion.x + ordenados[0].tamano.ancho);
    const hueco2 = ordenados[2].posicion.x - (ordenados[1].posicion.x + ordenados[1].tamano.ancho);
    expect(hueco1).toBeCloseTo(hueco2, 5);
    // los extremos no se mueven
    expect(ordenados[0].posicion.x).toBe(0);
    expect(ordenados[2].posicion.x).toBe(100);
  });

  it('no hace nada con menos de tres elementos', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 40, y: 0, ancho: 10, alto: 10 });
    const ids = doc.paginas[0].elementos.map((e) => e.id);
    expect(distribuir(doc, ids, 'horizontal')).toEqual(doc);
  });
});

describe('páginas', () => {
  it('añade una página con índice consecutivo', () => {
    const doc = anadirPagina(documentoVacio());
    expect(doc.paginas).toHaveLength(2);
    expect(doc.paginas[1].indice).toBe(1);
  });

  it('elimina una página y renumera los índices restantes', () => {
    let doc = anadirPagina(documentoVacio());
    doc = anadirPagina(doc);
    const idBorrar = doc.paginas[1].id;
    const resultado = eliminarPagina(doc, idBorrar);
    expect(resultado.paginas).toHaveLength(2);
    expect(resultado.paginas.map((p) => p.indice)).toEqual([0, 1]);
  });

  it('no permite eliminar la última página restante', () => {
    const doc = documentoVacio();
    const resultado = eliminarPagina(doc, doc.paginas[0].id);
    expect(resultado.paginas).toHaveLength(1);
  });

  it('establece y quita el fondo de una página (imagen subida por el usuario)', () => {
    const doc = documentoVacio();
    const id = doc.paginas[0].id;
    expect(doc.paginas[0].fondo).toBeNull();
    const conFondo = establecerFondoPagina(doc, id, { tipo: 'imagen', imagenUrl: 'https://ejemplo.test/fondo.png', ajuste: 'cubrir' });
    expect(conFondo.paginas[0].fondo).toEqual({ tipo: 'imagen', imagenUrl: 'https://ejemplo.test/fondo.png', ajuste: 'cubrir' });
    const sinFondo = establecerFondoPagina(conFondo, id, null);
    expect(sinFondo.paginas[0].fondo).toBeNull();
  });

  it('establecerFondoPagina no hace nada si la página no existe', () => {
    const doc = documentoVacio();
    const resultado = establecerFondoPagina(doc, 'pagina-inexistente', { tipo: 'color', color: '#fff' });
    expect(resultado).toEqual(doc);
  });
});

describe('sistema de estilos (Incremento 3)', () => {
  it('crearEstiloNombrado añade el estilo al catálogo y devuelve su id', () => {
    const doc = documentoVacio();
    const { documento: resultado, id } = crearEstiloNombrado(doc, 'Título', { fontSize: 24, fontWeight: 'bold' });
    expect(resultado.estilosGuardados).toHaveLength(1);
    expect(resultado.estilosGuardados[0].id).toBe(id);
    expect(resultado.estilosGuardados[0].valores).toEqual({ fontSize: 24, fontWeight: 'bold' });
  });

  it('actualizarEstiloNombrado mezcla los valores nuevos con los existentes', () => {
    const doc = documentoVacio();
    const { documento: conEstilo, id } = crearEstiloNombrado(doc, 'Título', { fontSize: 24, color: '#000' });
    const resultado = actualizarEstiloNombrado(conEstilo, id, { fontSize: 30 });
    expect(resultado.estilosGuardados[0].valores).toEqual({ fontSize: 30, color: '#000' });
  });

  it('aplicarEstiloNombrado vincula elementos y resolverEstiloEfectivo combina estilo con nombre + embebido (el embebido gana en conflicto)', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const idElemento = doc.paginas[0].elementos[0].id;
    doc = { ...doc, paginas: [{ ...doc.paginas[0], elementos: [{ ...doc.paginas[0].elementos[0], estilo: { color: 'red' } }] }] };
    const { documento: conEstilo, id: idEstilo } = crearEstiloNombrado(doc, 'Título', { fontSize: 24, color: 'blue' });
    const conAplicado = aplicarEstiloNombrado(conEstilo, [idElemento], idEstilo);
    const elemento = localizarElemento(conAplicado, idElemento)!.elemento;
    expect(elemento.estiloNombradoId).toBe(idEstilo);
    const efectivo = resolverEstiloEfectivo(conAplicado, elemento);
    expect(efectivo).toEqual({ fontSize: 24, color: 'red' }); // el embebido ('red') gana sobre el nombrado ('blue')
  });

  it('eliminarEstiloNombrado quita el estilo del catálogo y desvincula los elementos que lo usaban', () => {
    let doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const idElemento = doc.paginas[0].elementos[0].id;
    const { documento: conEstilo, id: idEstilo } = crearEstiloNombrado(doc, 'Título', { fontSize: 24 });
    const conAplicado = aplicarEstiloNombrado(conEstilo, [idElemento], idEstilo);
    const resultado = eliminarEstiloNombrado(conAplicado, idEstilo);
    expect(resultado.estilosGuardados).toHaveLength(0);
    expect(localizarElemento(resultado, idElemento)!.elemento.estiloNombradoId).toBeNull();
  });

  it('resolverEstiloEfectivo devuelve solo el estilo embebido si no hay estilo con nombre', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const elemento = doc.paginas[0].elementos[0];
    expect(resolverEstiloEfectivo(doc, elemento)).toBe(elemento.estilo);
  });

  it('establecerTema fija el tema propio del documento; null vuelve a "usar el de la Empresa"', () => {
    const doc = documentoVacio();
    const tema = { id: 't1', nombre: 'Oscuro', colores: { primario: '#000', secundario: '#111', fondo: '#222', texto: '#fff', textoClaro: '#ccc' }, tipografias: { titulos: 'Georgia', cuerpo: 'Arial' } };
    const conTema = establecerTema(doc, tema);
    expect(conTema.tema).toEqual(tema);
    expect(establecerTema(conTema, null).tema).toBeNull();
  });
});

describe('componentes reutilizables (Incremento 6)', () => {
  it('crearElementoInstanciaComponente crea un elemento vinculado con el componenteId dado', () => {
    const elemento = crearElementoInstanciaComponente('comp-1', { x: 10, y: 20 }, { ancho: 200, alto: 100 });
    expect(elemento.tipo).toBe('instanciaComponente');
    expect(elemento.contenido).toEqual({ componenteId: 'comp-1', version: 1, overridesLocales: {} });
    expect(elemento.origenComponente).toEqual({ componenteId: 'comp-1', version: 1, modo: 'vinculado' });
  });

  it('desvincularInstancia sustituye la instancia por copias reales de los elementos del componente, trasladadas a la posición de la instancia', () => {
    let doc = documentoVacio();
    const instancia = crearElementoInstanciaComponente('comp-1', { x: 100, y: 50 }, { ancho: 300, alto: 150 });
    doc = anadirElemento(doc, 'pag-1', instancia);

    const elementosComponente = [
      crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 100, alto: 20 }),
      crearElementoBase('texto', { x: 0, y: 30 }, { ancho: 100, alto: 20 }),
    ];

    const resultado = desvincularInstancia(doc, instancia.id, elementosComponente, 'comp-1');
    expect(resultado.paginas[0].elementos).toHaveLength(2); // la instancia desaparece, la sustituyen sus 2 hijos
    expect(resultado.paginas[0].elementos.some((e) => e.id === instancia.id)).toBe(false);
    expect(resultado.paginas[0].elementos[0].posicion).toEqual({ x: 100, y: 50 }); // 0,0 + 100,50
    expect(resultado.paginas[0].elementos[1].posicion).toEqual({ x: 100, y: 80 }); // 0,30 + 100,50
    const grupoId = resultado.paginas[0].elementos[0].grupoId;
    expect(grupoId).not.toBeNull();
    expect(resultado.paginas[0].elementos[1].grupoId).toBe(grupoId); // ambos quedan agrupados entre sí
    expect(resultado.paginas[0].elementos[0].origenComponente).toEqual({ componenteId: 'comp-1', version: 1, modo: 'independiente' });
  });

  it('desvincularInstancia no hace nada si el elemento no es una instanciaComponente', () => {
    const doc = conElementos({ x: 0, y: 0, ancho: 10, alto: 10 });
    const id = doc.paginas[0].elementos[0].id;
    const resultado = desvincularInstancia(doc, id, [], 'comp-1');
    expect(resultado).toEqual(doc);
  });
});
