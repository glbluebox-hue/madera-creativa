import { z } from 'zod';
import {
  registrarTipoElemento,
  obtenerTipoElemento,
  listarTiposElemento,
  validarElementoMC,
  validarPaginaMC,
  validarDocumentoMC,
  ErrorTipoElementoDesconocido,
} from './documento-registro-tipos.js';
import { PAGINA_A4 } from './documento-modelo.js';

/**
 * Pruebas del motor de registro en sí (no de los tipos concretos de la
 * app — esos se cubren en documento-motor-inicializar.spec.ts). Registra
 * tipos sintéticos propios para no depender del registro global compartido
 * con el resto de la aplicación.
 */

function elementoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'el-1',
    tipo: 'notaDePrueba',
    posicion: { x: 0, y: 0 },
    tamano: { ancho: 10, alto: 10 },
    contenido: { texto: 'hola' },
    ...overrides,
  };
}

function documentoBase(elementos: unknown[]) {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    paginas: [
      {
        id: 'pag-1',
        indice: 0,
        elementos,
      },
    ],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
  };
}

describe('registro de tipos de elemento — documento-registro-tipos', () => {
  it('registra un tipo y permite recuperarlo por su nombre', () => {
    registrarTipoElemento({
      tipo: 'notaDePrueba',
      descripcion: 'Tipo sintético para pruebas.',
      contieneRecurso: false,
      esquemaContenido: z.object({ texto: z.string() }),
      esquemaPropiedadesEspecificas: z.object({}),
      esquemaEstilo: z.object({}),
    });

    const definicion = obtenerTipoElemento('notaDePrueba');
    expect(definicion.tipo).toBe('notaDePrueba');
    expect(listarTiposElemento().some((t) => t.tipo === 'notaDePrueba')).toBe(true);
  });

  it('lanza ErrorTipoElementoDesconocido al pedir un tipo no registrado', () => {
    expect(() => obtenerTipoElemento('estoNoExiste')).toThrow(ErrorTipoElementoDesconocido);
  });

  it('rechaza registrar un tipo con contieneRecurso:true sin los accessors obligatorios', () => {
    expect(() =>
      registrarTipoElemento({
        tipo: 'imagenRota',
        descripcion: 'Declara recurso pero no aporta accessors.',
        contieneRecurso: true,
        esquemaContenido: z.object({}),
        esquemaPropiedadesEspecificas: z.object({}),
        esquemaEstilo: z.object({}),
      })
    ).toThrow(/obtenerRecurso\/establecerRecurso/);
  });

  it('validarElementoMC valida el sobre común y delega contenido/estilo en el tipo registrado', () => {
    const elemento = validarElementoMC(elementoBase());
    expect(elemento.contenido).toEqual({ texto: 'hola' });
    expect(elemento.capa).toBe(0); // default de la envolvente común
  });

  it('validarElementoMC rechaza un tipo desconocido', () => {
    expect(() => validarElementoMC(elementoBase({ tipo: 'noRegistrado' }))).toThrow(ErrorTipoElementoDesconocido);
  });

  it('validarElementoMC rechaza contenido que no cumple el esquema del tipo (dato real de tipo equivocado, no simulado)', () => {
    expect(() => validarElementoMC(elementoBase({ contenido: { texto: 123 } }))).toThrow();
  });

  it('validarPaginaMC valida todos los elementos de la página, incluidos encabezado y pie', () => {
    const pagina = validarPaginaMC({
      id: 'pag-1',
      indice: 0,
      elementos: [elementoBase({ id: 'el-cuerpo' })],
      encabezado: { altura: 50, elementos: [elementoBase({ id: 'el-encabezado' })] },
      pie: 'ninguno',
    });
    expect(pagina.elementos).toHaveLength(1);
    expect(pagina.encabezado).not.toBe('ninguno');
    if (pagina.encabezado !== 'ninguno' && pagina.encabezado) {
      expect(pagina.encabezado.elementos[0].id).toBe('el-encabezado');
    }
    expect(pagina.pie).toBe('ninguno');
  });

  it('validarDocumentoMC acepta un documento válido con un elemento del tipo registrado', () => {
    const documento = validarDocumentoMC(documentoBase([elementoBase()]));
    expect(documento.paginas[0].elementos).toHaveLength(1);
    expect(documento.schemaVersion).toBe(1);
  });

  it('validarDocumentoMC rechaza un documento con un elemento de tipo desconocido', () => {
    expect(() => validarDocumentoMC(documentoBase([elementoBase({ tipo: 'tipoQueNoExiste' })]))).toThrow(ErrorTipoElementoDesconocido);
  });

  it('validarDocumentoMC rechaza un documento sin schemaVersion válido', () => {
    const doc = documentoBase([elementoBase()]) as Record<string, unknown>;
    doc.schemaVersion = 2;
    expect(() => validarDocumentoMC(doc)).toThrow();
  });
});

describe('sistema de estilos (Incremento 3) — tema y estilos con nombre', () => {
  it('acepta un documento con tema y estilosGuardados completos', () => {
    const doc = documentoBase([elementoBase({ estiloNombradoId: 'estilo-titulo' })]) as Record<string, unknown>;
    doc.tema = { id: 't1', nombre: 'Corporativo', colores: { primario: '#000' }, tipografias: { titulos: 'Georgia' } };
    doc.estilosGuardados = [{ id: 'estilo-titulo', nombre: 'Título', valores: { fontSize: 24, fontWeight: 'bold' } }];
    const validado = validarDocumentoMC(doc);
    expect(validado.tema?.nombre).toBe('Corporativo');
    expect(validado.tema?.colores.secundario).toBe('#8a6835'); // default aplicado a un campo no especificado
    expect(validado.estilosGuardados[0].valores).toEqual({ fontSize: 24, fontWeight: 'bold' });
    expect(validado.paginas[0].elementos[0].estiloNombradoId).toBe('estilo-titulo');
  });

  it('tema es null por defecto si no se especifica', () => {
    const doc = documentoBase([elementoBase()]);
    expect(validarDocumentoMC(doc).tema).toBeNull();
  });

  it('estiloNombradoId de un elemento es null por defecto', () => {
    const doc = documentoBase([elementoBase()]);
    expect(validarDocumentoMC(doc).paginas[0].elementos[0].estiloNombradoId).toBeNull();
  });

  it('rechaza un tema con un campo de color que no es string', () => {
    const doc = documentoBase([elementoBase()]) as Record<string, unknown>;
    doc.tema = { id: 't1', nombre: 'Roto', colores: { primario: 123 } };
    expect(() => validarDocumentoMC(doc)).toThrow();
  });
});
