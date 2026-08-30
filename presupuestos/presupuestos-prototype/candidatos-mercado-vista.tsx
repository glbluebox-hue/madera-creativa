import { useRef, useState } from 'react';
import type { NivelGeografico, AlcanceTrabajo, NivelCalidad } from './mercado-local.js';
import { Chip, ETIQUETA_NIVEL, ETIQUETA_ALCANCE, ETIQUETA_CALIDAD } from './referencias-mercado-vista.js';
import * as api from './api.js';
import type { CandidatoMercado, ResultadoBuscarMercado } from './api.js';
import { candidatoAReferenciaMercado, detectarEstanciaMedida, formatearEstancia } from './candidatos-mercado.js';
import { formatoEuro } from './calculos.js';
import { validarImagenParaIA, comprimirImagen, MIME_IMAGEN_PERMITIDOS } from './procesamiento-imagenes.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { generarId } from './mock.js';
import type { Estancia } from './types.js';
import styles from './styles.module.css';

export type CandidatosMercadoVistaProps = {
  tipoTrabajo: string;
  /** Alcance/calidad ya elegidos en el formulario manual, si el usuario los tenía marcados — evita preguntarlo dos veces (encargo, punto 2: reutilizar lo que ya existe). */
  alcanceInicial: AlcanceTrabajo;
  nivelCalidadInicial: NivelCalidad | null;
  /** Texto libre best-effort ya extraído del presupuesto, si lo hay — nunca obligatorio. */
  descripcionLibre?: string;
  /** Estancias YA medidas del proyecto (Pizarra de medición) — si alguna coincide con `tipoTrabajo`, sus medidas reales se ofrecen para dar más contexto a la búsqueda (30/08/2026). */
  estancias?: Estancia[];
  /** Se llama tras guardar CADA candidato aceptado — mismo `onCambio` que ya usa el formulario manual, para refrescar la lista de referencias. */
  onGuardado: () => void;
  onCerrar: () => void;
};

type ImagenAdjunta = { id: string; dataUrl: string; nombre: string };

/** Solo da contexto de materiales/estilo — no es una galería, así que un tope bajo es suficiente. */
const LIMITE_IMAGENES_MERCADO = 3;

const ETIQUETA_SI_NO: Record<'si' | 'no' | 'desconocido', string> = { si: 'Sí', no: 'No', desconocido: 'No indicado' };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
      <strong style={{ color: 'var(--negro)' }}>{etiqueta}:</strong> {valor}
    </span>
  );
}

function TarjetaCandidato({ candidato, onGuardar, onDescartar, guardando }: {
  candidato: CandidatoMercado;
  onGuardar: () => void;
  onDescartar: () => void;
  guardando: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.7rem 0.8rem', border: '1px solid var(--borde)', borderRadius: 8, background: 'var(--blanco)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1rem' }}>
          {candidato.precio != null ? (candidato.moneda === 'EUR' || !candidato.moneda ? formatoEuro(candidato.precio) : `${candidato.precio} ${candidato.moneda}`) : 'Precio no indicado'}
        </strong>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: candidato.confianza === 'alta' ? 'var(--verde)' : candidato.confianza === 'media' ? 'var(--ocre)' : 'var(--topo-claro)' }}>
          Confianza {candidato.confianza}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
        <Dato etiqueta="Ubicación" valor={candidato.ubicacion} />
        <Dato etiqueta="Incluye" valor={candidato.queIncluye} />
        <Dato etiqueta="No incluye" valor={candidato.queNoIncluye} />
        <Dato etiqueta="Calidad" valor={candidato.calidad ? ETIQUETA_CALIDAD[candidato.calidad] : null} />
        <Dato etiqueta="IVA/IGIC incluido" valor={ETIQUETA_SI_NO[candidato.ivaIncluido]} />
        <Dato etiqueta="Instalación incluida" valor={ETIQUETA_SI_NO[candidato.instalacionIncluida]} />
        <Dato etiqueta="Fecha" valor={candidato.fechaReferencia} />
      </div>

      {candidato.extracto && (
        <p style={{ margin: 0, fontSize: '0.76rem', fontStyle: 'italic', color: 'var(--topo-claro)' }}>
          &ldquo;{candidato.extracto}&rdquo;
        </p>
      )}
      {candidato.explicacionComparabilidad && (
        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--topo-claro)' }}>{candidato.explicacionComparabilidad}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
        {candidato.url ? (
          <a href={candidato.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.76rem' }}>
            {candidato.fuente || candidato.url} ↗
          </a>
        ) : (
          <span style={{ fontSize: '0.76rem', color: 'var(--topo-claro)' }}>{candidato.fuente || 'Fuente no disponible'}</span>
        )}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={onDescartar} disabled={guardando}>
            Descartar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Investigación de Mercado con IA (30/08/2026) — "Buscar con IA" pide a
 * OpenAI (búsqueda web real) precios comparables y los muestra como
 * candidatos con su fuente/URL/extracto. NUNCA guarda nada por su cuenta
 * (encargo, punto 4): cada tarjeta se guarda o se descarta una a una, con
 * el mismo endpoint `crearReferenciaMercado` que usa el formulario manual
 * — un candidato guardado pasa por el MISMO filtro de comparabilidad que
 * cualquier referencia manual, sin ningún camino paralelo.
 */
export function CandidatosMercadoVista({ tipoTrabajo, alcanceInicial, nivelCalidadInicial, descripcionLibre, estancias, onGuardado, onCerrar }: CandidatosMercadoVistaProps) {
  const [nivel, setNivel] = useState<NivelGeografico>('local');
  const [alcance, setAlcance] = useState<AlcanceTrabajo>(alcanceInicial);
  const [nivelCalidad, setNivelCalidad] = useState<NivelCalidad | null>(nivelCalidadInicial);
  const [estado, setEstado] = useState<'eligiendo' | 'describiendo' | 'buscando' | 'listo' | 'error'>('eligiendo');
  const [resultado, setResultado] = useState<ResultadoBuscarMercado | null>(null);
  const [descripcionGenerada, setDescripcionGenerada] = useState('');
  const [error, setError] = useState('');
  const [resueltos, setResueltos] = useState<Set<number>>(new Set()); // índices ya guardados o descartados
  const [guardandoIndice, setGuardandoIndice] = useState<number | null>(null);

  // Contexto real opcional (30/08/2026) — fotos adjuntadas a mano y medidas
  // reales (detectadas de la Pizarra de medición, o elegidas/escritas por el
  // usuario si hay más de una estancia o ninguna) para que la búsqueda sea
  // específica en vez de "Cocina, Tenerife" genérico.
  const inputImagenRef = useRef<HTMLInputElement>(null);
  const [imagenes, setImagenes] = useState<ImagenAdjunta[]>([]);
  const [procesandoImagen, setProcesandoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');

  const estanciaAuto = detectarEstanciaMedida(estancias, tipoTrabajo);
  const [estanciaElegidaId, setEstanciaElegidaId] = useState<string | null>(null);
  const [usarMedidasManual, setUsarMedidasManual] = useState(false);
  const [medidaAncho, setMedidaAncho] = useState('');
  const [medidaAlto, setMedidaAlto] = useState('');

  const estanciaElegida = estanciaAuto ?? estancias?.find((e) => e.id === estanciaElegidaId) ?? null;
  const medidasTexto = estanciaElegida
    ? formatearEstancia(estanciaElegida)
    : (usarMedidasManual && medidaAncho && medidaAlto ? `Medidas dadas a mano: ancho ${medidaAncho} m, alto ${medidaAlto} m.` : '');

  const seleccionarImagen = async (file: File) => {
    setErrorImagen('');
    const validacion = validarImagenParaIA(file);
    if (validacion.valido === false) { setErrorImagen(validacion.motivo); return; }
    setProcesandoImagen(true);
    try {
      const { blob } = await comprimirImagen(file, { forzarJpeg: true });
      const dataUrl = await leerArchivoComoBase64(blob);
      setImagenes((prev) => [...prev, { id: generarId(), dataUrl, nombre: file.name }]);
    } catch {
      setErrorImagen('No se pudo procesar la imagen. Prueba con otra.');
    } finally {
      setProcesandoImagen(false);
    }
  };

  const quitarImagen = (id: string) => setImagenes((prev) => prev.filter((img) => img.id !== id));

  const buscar = async () => {
    setError('');
    let descripcionParaBusqueda = descripcionLibre ?? '';

    if (imagenes.length > 0 || medidasTexto) {
      setEstado('describiendo');
      try {
        const respuesta = await api.generarRespuestaIA({
          capacidad: 'describir-trabajo-mercado',
          mensajes: [{ role: 'user', content: medidasTexto || '(sin medidas dadas)', imagenes: imagenes.map((i) => i.dataUrl) }],
        });
        setDescripcionGenerada(respuesta.respuesta);
        descripcionParaBusqueda = [descripcionParaBusqueda, respuesta.respuesta].filter(Boolean).join(' ');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo describir el trabajo — se busca igualmente con los datos generales.');
        // No es un fallo bloqueante: se sigue a la búsqueda con lo que ya había (encargo: nunca dejar de buscar por un paso opcional).
      }
    }

    setEstado('buscando');
    try {
      const r = await api.buscarPreciosMercado({ tipoTrabajo, nivelGeografico: nivel, alcance, nivelCalidad, descripcionLibre: descripcionParaBusqueda });
      setResultado(r);
      setResueltos(new Set());
      setEstado('listo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la búsqueda.');
      setEstado('error');
    }
  };

  const guardarCandidato = async (indice: number) => {
    const c = resultado?.candidatos[indice];
    if (!c || c.precio == null) return;
    setGuardandoIndice(indice);
    try {
      await api.crearReferenciaMercado(candidatoAReferenciaMercado({ ...c, precio: c.precio }, {
        tipoTrabajo, nivelGeografico: nivel, zona: resultado!.zona, alcance, fechaInvestigacion: resultado!.creado,
      }));
      setResueltos((prev) => new Set(prev).add(indice));
      onGuardado();
    } catch {
      setError('No se pudo guardar este candidato. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardandoIndice(null);
    }
  };

  const descartarCandidato = (indice: number) => {
    setResueltos((prev) => new Set(prev).add(indice));
  };

  const candidatosPendientes = resultado?.candidatos.map((c, i) => ({ c, i })).filter(({ i }) => !resueltos.has(i)) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.7rem', border: '1px dashed var(--borde)', borderRadius: 8 }}>
      {estado === 'eligiendo' && (
        <>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
            La IA buscará precios reales publicados en la web para <strong>{tipoTrabajo}</strong> — revisa y confirma antes de que se guarde nada.
          </p>
          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Zona</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['local', 'regional', 'nacional'] as NivelGeografico[]).map((n) => (
                <Chip key={n} activo={nivel === n} onClick={() => setNivel(n)}>{ETIQUETA_NIVEL[n]}</Chip>
              ))}
            </div>
          </div>
          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>¿Qué incluye?</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(Object.keys(ETIQUETA_ALCANCE) as AlcanceTrabajo[]).map((a) => (
                <Chip key={a} activo={alcance === a} onClick={() => setAlcance(a)}>{ETIQUETA_ALCANCE[a]}</Chip>
              ))}
            </div>
          </div>
          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Calidad (opcional)</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(Object.keys(ETIQUETA_CALIDAD) as NivelCalidad[]).map((c) => (
                <Chip key={c} activo={nivelCalidad === c} onClick={() => setNivelCalidad(nivelCalidad === c ? null : c)}>{ETIQUETA_CALIDAD[c]}</Chip>
              ))}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Medidas reales (opcional, mejora mucho la búsqueda)</p>
            {estanciaAuto ? (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--verde)' }}>✓ Medidas detectadas automáticamente de "{estanciaAuto.nombre}" (Pizarra de medición).</p>
            ) : estancias?.length ? (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {estancias.map((e) => (
                  <Chip key={e.id} activo={estanciaElegidaId === e.id} onClick={() => setEstanciaElegidaId(estanciaElegidaId === e.id ? null : e.id)}>{e.nombre}</Chip>
                ))}
              </div>
            ) : !usarMedidasManual ? (
              <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => setUsarMedidasManual(true)}>
                + Añadir medidas a mano
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input className={styles.input} type="number" min={0} step="0.01" placeholder="Ancho (m)" value={medidaAncho} onChange={(e) => setMedidaAncho(e.target.value)} style={{ maxWidth: 110 }} />
                <input className={styles.input} type="number" min={0} step="0.01" placeholder="Alto (m)" value={medidaAlto} onChange={(e) => setMedidaAlto(e.target.value)} style={{ maxWidth: 110 }} />
              </div>
            )}
            {estanciaElegida && !estanciaAuto && (
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: 'var(--topo-claro)' }}>{formatearEstancia(estanciaElegida) || 'Esta estancia no tiene medidas numéricas guardadas.'}</p>
            )}
          </div>

          <div>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase' }}>Foto (opcional, hasta {LIMITE_IMAGENES_MERCADO})</p>
            {errorImagen && <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: 'var(--rojo)' }}>{errorImagen}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
              {imagenes.map((img) => (
                <div key={img.id} style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                  <img src={img.dataUrl} alt={img.nombre} title={img.nombre} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--borde)' }} />
                  <button
                    className={styles.btnIcono}
                    onClick={() => quitarImagen(img.id)}
                    aria-label={`Quitar ${img.nombre}`}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, minWidth: 18, padding: 0, borderRadius: '50%', background: 'var(--blanco)', border: '1px solid var(--borde)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              {imagenes.length < LIMITE_IMAGENES_MERCADO && (
                <button
                  className={styles.btnIcono}
                  onClick={() => inputImagenRef.current?.click()}
                  disabled={procesandoImagen}
                  aria-label="Añadir foto"
                  title="Añadir foto"
                  style={{ width: 40, height: 40, borderRadius: 6, border: '1px dashed var(--borde)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              )}
            </div>
            <input
              ref={inputImagenRef}
              type="file"
              accept={MIME_IMAGEN_PERMITIDOS.join(',')}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                const hueco = LIMITE_IMAGENES_MERCADO - imagenes.length;
                files.slice(0, hueco).forEach((file) => { void seleccionarImagen(file); });
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={onCerrar}>Cancelar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={buscar}>🔍 Buscar con IA</button>
          </div>
        </>
      )}

      {estado === 'describiendo' && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>🧠 Describiendo tu trabajo a partir de la foto/medidas…</p>
      )}

      {estado === 'buscando' && (
        <>
          {descripcionGenerada && (
            <p style={{ margin: 0, fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--topo-claro)' }}>{descripcionGenerada}</p>
          )}
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>🔎 Buscando precios reales en la web… puede tardar hasta un minuto.</p>
        </>
      )}

      {estado === 'error' && (
        <>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--rojo)' }}>{error}</p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={onCerrar}>Cerrar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={buscar}>Reintentar</button>
          </div>
        </>
      )}

      {estado === 'listo' && resultado && (
        <>
          {descripcionGenerada && (
            <p style={{ margin: 0, fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--topo-claro)' }}>{descripcionGenerada}</p>
          )}
          {resultado.desdeCache && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>Resultado de una investigación reciente (menos de 24h) — reutilizado para no repetir la búsqueda.</p>
          )}
          {/* Se muestra siempre que haya un motivo (incluso con candidatos válidos restantes) — p. ej. "se descartaron 2 resultados por no ser de Tenerife": nunca se oculta que algo se filtró por zona, aunque no afecte al resultado final. */}
          {resultado.motivoSinResultados && resultado.candidatos.length > 0 && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ocre)' }}>{resultado.motivoSinResultados}</p>
          )}
          {resultado.sinResultadosFiables || resultado.candidatos.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
              No hemos encontrado referencias de mercado suficientemente fiables para este trabajo y esta zona{resultado.motivoSinResultados ? ` — ${resultado.motivoSinResultados}` : '.'}
            </p>
          ) : candidatosPendientes.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--verde)' }}>Has revisado todos los candidatos encontrados.</p>
          ) : (
            candidatosPendientes.map(({ c, i }) => (
              <TarjetaCandidato key={i} candidato={c} guardando={guardandoIndice === i} onGuardar={() => guardarCandidato(i)} onDescartar={() => descartarCandidato(i)} />
            ))
          )}
          {error && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--rojo)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={onCerrar}>Cerrar</button>
          </div>
        </>
      )}
    </div>
  );
}
