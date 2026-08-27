import { resolverEmisorReceptor, type DatosExtraidosFactura, type EmpresaIdentificacion } from './identificacion-factura.js';

const EMPRESA: EmpresaIdentificacion = { nombre: 'Madera Creativa', titular: 'Juan García Pérez', nifCif: 'B12345678' };

function datos(parciales: Partial<DatosExtraidosFactura>): DatosExtraidosFactura {
  return {
    emisorNombre: null, emisorCifNif: null, emisorDireccion: null, emisorCodigoPostal: null,
    receptorNombre: null, receptorCifNif: null, receptorDireccion: null, receptorCodigoPostal: null,
    tipo: null,
    ...parciales,
  };
}

describe('resolverEmisorReceptor (auditoría emisor/receptor, 23/08/2026)', () => {
  it('1. NIF de Madera Creativa como emisor → ingreso, proveedor = receptor', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Cliente Ejemplo S.L.', receptorCifNif: 'A87654321',
      tipo: 'gasto', // la IA se equivoca aquí a propósito, para el test 8
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
    expect(r.proveedor).toBe('Cliente Ejemplo S.L.');
    expect(r.cifNif).toBe('A87654321');
    expect(r.confianza).toBe('alta');
    expect(r.revisar).toBe(false);
  });

  it('2. NIF de Madera Creativa como receptor → gasto, proveedor = emisor', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Ferretería López', emisorCifNif: 'B99999999',
      receptorNombre: 'Madera Creativa', receptorCifNif: 'B12345678',
      tipo: 'gasto',
    }), EMPRESA);
    expect(r.tipo).toBe('gasto');
    expect(r.proveedor).toBe('Ferretería López');
    expect(r.cifNif).toBe('B99999999');
    expect(r.confianza).toBe('alta');
    expect(r.revisar).toBe(false);
  });

  it('3. Ambos NIF presentes y solo uno coincide con Madera Creativa', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Otro Negocio S.L.', receptorCifNif: 'X00000000',
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
    expect(r.confianza).toBe('alta');
  });

  it('4. Nombre de Madera Creativa repetido varias veces no confunde la resolución por NIF', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Cliente Real', receptorCifNif: 'C11111111',
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
    expect(r.proveedor).toBe('Cliente Real');
    expect(r.confianza).toBe('alta');
  });

  it('5. NIF parcialmente ilegible no produce una coincidencia falsa — no confunde con evidencia fuerte', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B1234', // ilegible/incompleto, no coincide con B12345678
      receptorNombre: 'Cliente Real', receptorCifNif: 'C11111111',
    }), EMPRESA);
    // Sin coincidencia fuerte de NIF, cae a nombre — "Madera Creativa" sí coincide por nombre.
    expect(r.tipo).toBe('ingreso');
    expect(r.confianza).toBe('media');
  });

  it('6. Sin ningún NIF disponible → fallback por nombre normalizado, confianza media', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'MADERA CREATIVA S.L.', emisorCifNif: null,
      receptorNombre: 'Cliente Sin NIF', receptorCifNif: null,
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
    expect(r.proveedor).toBe('Cliente Sin NIF');
    expect(r.confianza).toBe('media');
  });

  it('7. Nombres ambiguos / sin relación con Madera Creativa → revisión obligatoria, nunca falsa certeza', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Empresa Desconocida A', emisorCifNif: 'Z11111111',
      receptorNombre: 'Empresa Desconocida B', receptorCifNif: 'Z22222222',
      tipo: null,
    }), EMPRESA);
    expect(r.revisar).toBe(true);
    expect(r.confianza).toBe('baja');
    expect(r.proveedor).toBe('');
    expect(r.cifNif).toBe('');
  });

  it('8. La IA propone un tipo contrario al que demuestra el NIF → gana el NIF', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Cliente Real', receptorCifNif: 'C11111111',
      tipo: 'gasto', // la IA cree que es un gasto; el NIF demuestra que es un ingreso
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
  });

  it('9. Ingreso correctamente identificado de principio a fin', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Juan Pérez', receptorCifNif: '12345678Z',
      tipo: 'ingreso',
    }), EMPRESA);
    expect(r).toEqual({ tipo: 'ingreso', proveedor: 'Juan Pérez', cifNif: '12345678Z', direccion: '', codigoPostal: '', confianza: 'alta', revisar: false });
  });

  it('10. Gasto correctamente identificado de principio a fin', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Maderas del Norte S.L.', emisorCifNif: 'B55555555',
      receptorNombre: 'Madera Creativa', receptorCifNif: 'B12345678',
      tipo: 'gasto',
    }), EMPRESA);
    expect(r).toEqual({ tipo: 'gasto', proveedor: 'Maderas del Norte S.L.', cifNif: 'B55555555', direccion: '', codigoPostal: '', confianza: 'alta', revisar: false });
  });

  it('sin datos de empresa configurados (nifCif/nombre vacíos), no se puede verificar nada → revisión obligatoria', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Alguien', emisorCifNif: 'B12345678',
      receptorNombre: 'Otro', receptorCifNif: 'C11111111',
      tipo: 'gasto',
    }), { nombre: '', titular: '', nifCif: '' });
    expect(r.revisar).toBe(true);
    expect(r.confianza).toBe('baja');
    expect(r.tipo).toBe('gasto'); // conserva la pista de la IA al no tener nada que la contradiga
    expect(r.proveedor).toBe('Alguien');
  });

  it('11. Factura de ingreso con el nombre y apellidos del titular (autónomo), no la marca → reconocido igualmente', () => {
    // Caso real reportado 25/08/2026: como autónomo, una factura de ingreso
    // suele llevar el nombre legal (titular), no el nombre comercial —
    // antes de añadir `titular` a `EmpresaIdentificacion`, este caso caía
    // siempre al fallback de confianza baja con revisión obligatoria.
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Juan García Pérez', emisorCifNif: null,
      receptorNombre: 'Cliente Real S.L.', receptorCifNif: 'C11111111',
    }), EMPRESA);
    expect(r.tipo).toBe('ingreso');
    expect(r.proveedor).toBe('Cliente Real S.L.');
    expect(r.confianza).toBe('media');
    expect(r.revisar).toBe(false);
  });

  it('NIF coincide en los dos lados a la vez (documento raro) → no es evidencia fuerte, no decide por NIF', () => {
    const r = resolverEmisorReceptor(datos({
      emisorNombre: 'Madera Creativa', emisorCifNif: 'B12345678',
      receptorNombre: 'Madera Creativa', receptorCifNif: 'B12345678',
      tipo: 'ingreso',
    }), EMPRESA);
    // Ambos "coinciden" con la empresa por NIF y por nombre — no hay forma objetiva de distinguir cuál es cuál.
    expect(r.revisar).toBe(true);
    expect(r.confianza).toBe('baja');
  });
});
