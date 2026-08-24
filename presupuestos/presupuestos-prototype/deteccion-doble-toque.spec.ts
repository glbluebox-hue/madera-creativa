import { esDobleToque, fueArrastre, INTERVALO_MAXIMO_MS_DEFECTO, DISTANCIA_MAXIMA_TOQUE_PX_DEFECTO, DISTANCIA_MAXIMA_ARRASTRE_PX_DEFECTO, type PuntoToque } from './deteccion-doble-toque.js';

function toque(elementoId: string, tiempo: number, x: number, y: number): PuntoToque {
  return { elementoId, tiempo, x, y };
}

describe('esDobleToque (Fase B, Prioridad 1 — edición de texto táctil, 24/08/2026)', () => {
  it('1. doble toque válido: mismo elemento, dentro del intervalo y de la distancia', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1000 + 200, 102, 101);
    expect(esDobleToque(primero, segundo)).toBe(true);
  });

  it('2. intervalo demasiado largo: mismo sitio, pero pasó más tiempo del permitido', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1000 + INTERVALO_MAXIMO_MS_DEFECTO + 1, 100, 100);
    expect(esDobleToque(primero, segundo)).toBe(false);
  });

  it('justo en el límite del intervalo SÍ cuenta (inclusive)', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1000 + INTERVALO_MAXIMO_MS_DEFECTO, 100, 100);
    expect(esDobleToque(primero, segundo)).toBe(true);
  });

  it('3. distancia demasiado grande entre el primer y el segundo toque', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1200, 100 + DISTANCIA_MAXIMA_TOQUE_PX_DEFECTO + 1, 100);
    expect(esDobleToque(primero, segundo)).toBe(false);
  });

  it('justo en el límite de distancia SÍ cuenta (inclusive)', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1200, 100 + DISTANCIA_MAXIMA_TOQUE_PX_DEFECTO, 100);
    expect(esDobleToque(primero, segundo)).toBe(true);
  });

  it('4. elementos diferentes: nunca cuenta como doble toque, aunque tiempo/distancia sean perfectos', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-2', 1100, 100, 100);
    expect(esDobleToque(primero, segundo)).toBe(false);
  });

  it('5. primer toque: sin un anterior (null), nunca puede ser un doble toque', () => {
    const actual = toque('el-1', 1000, 100, 100);
    expect(esDobleToque(null, actual)).toBe(false);
  });

  it('6. coordenadas iguales: distancia 0 sigue contando como doble toque válido', () => {
    const primero = toque('el-1', 1000, 50, 50);
    const segundo = toque('el-1', 1150, 50, 50);
    expect(esDobleToque(primero, segundo)).toBe(true);
  });

  it('7. timestamps: un segundo toque con tiempo anterior al primero (reloj inconsistente) no cuenta', () => {
    const primero = toque('el-1', 2000, 100, 100);
    const segundo = toque('el-1', 1000, 100, 100); // tiempo "hacia atrás"
    expect(esDobleToque(primero, segundo)).toBe(false);
  });

  it('7b. timestamps: dt=0 (dos toques con el mismo timestamp) cuenta como válido si la distancia es correcta', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1000, 100, 100);
    expect(esDobleToque(primero, segundo)).toBe(true);
  });

  it('respeta opciones de intervalo/distancia personalizadas en vez de las de por defecto', () => {
    const primero = toque('el-1', 1000, 100, 100);
    const segundo = toque('el-1', 1000 + 50, 100, 100);
    expect(esDobleToque(primero, segundo, { intervaloMaximoMs: 30 })).toBe(false);
    expect(esDobleToque(primero, segundo, { intervaloMaximoMs: 100 })).toBe(true);
  });
});

describe('fueArrastre (evitar falsos positivos durante arrastre)', () => {
  it('8. evitar falsos positivos durante arrastre: el propio gesto se movió más de lo permitido → es arrastre', () => {
    const inicio = { x: 100, y: 100 };
    const fin = { x: 100 + DISTANCIA_MAXIMA_ARRASTRE_PX_DEFECTO + 1, y: 100 };
    expect(fueArrastre(inicio, fin)).toBe(true);
  });

  it('un gesto que apenas se mueve (temblor de dedo/ratón) NO es arrastre', () => {
    const inicio = { x: 100, y: 100 };
    const fin = { x: 101, y: 100 };
    expect(fueArrastre(inicio, fin)).toBe(false);
  });

  it('justo en el límite de distancia de arrastre NO cuenta como arrastre (inclusive)', () => {
    const inicio = { x: 100, y: 100 };
    const fin = { x: 100 + DISTANCIA_MAXIMA_ARRASTRE_PX_DEFECTO, y: 100 };
    expect(fueArrastre(inicio, fin)).toBe(false);
  });

  it('coordenadas idénticas nunca son arrastre', () => {
    expect(fueArrastre({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(false);
  });
});
