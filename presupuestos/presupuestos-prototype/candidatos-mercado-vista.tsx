import { useState } from 'react';
import type { NivelGeografico, AlcanceTrabajo, NivelCalidad } from './mercado-local.js';
import { Chip, ETIQUETA_NIVEL, ETIQUETA_ALCANCE, ETIQUETA_CALIDAD } from './referencias-mercado-vista.js';
import * as api from './api.js';
import type { CandidatoMercado, ResultadoBuscarMercado } from './api.js';
import { candidatoAReferenciaMercado } from './candidatos-mercado.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

export type CandidatosMercadoVistaProps = {
  tipoTrabajo: string;
  /** Alcance/calidad ya elegidos en el formulario manual, si el usuario los tenía marcados — evita preguntarlo dos veces (encargo, punto 2: reutilizar lo que ya existe). */
  alcanceInicial: AlcanceTrabajo;
  nivelCalidadInicial: NivelCalidad | null;
  /** Texto libre best-effort ya extraído del presupuesto, si lo hay — nunca obligatorio. */
  descripcionLibre?: string;
  /** Se llama tras guardar CADA candidato aceptado — mismo `onCambio` que ya usa el formulario manual, para refrescar la lista de referencias. */
  onGuardado: () => void;
  onCerrar: () => void;
};

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
export function CandidatosMercadoVista({ tipoTrabajo, alcanceInicial, nivelCalidadInicial, descripcionLibre, onGuardado, onCerrar }: CandidatosMercadoVistaProps) {
  const [nivel, setNivel] = useState<NivelGeografico>('local');
  const [alcance, setAlcance] = useState<AlcanceTrabajo>(alcanceInicial);
  const [nivelCalidad, setNivelCalidad] = useState<NivelCalidad | null>(nivelCalidadInicial);
  const [estado, setEstado] = useState<'eligiendo' | 'buscando' | 'listo' | 'error'>('eligiendo');
  const [resultado, setResultado] = useState<ResultadoBuscarMercado | null>(null);
  const [error, setError] = useState('');
  const [resueltos, setResueltos] = useState<Set<number>>(new Set()); // índices ya guardados o descartados
  const [guardandoIndice, setGuardandoIndice] = useState<number | null>(null);

  const buscar = async () => {
    setEstado('buscando');
    setError('');
    try {
      const r = await api.buscarPreciosMercado({ tipoTrabajo, nivelGeografico: nivel, alcance, nivelCalidad, descripcionLibre });
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
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={onCerrar}>Cancelar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={buscar}>🔍 Buscar con IA</button>
          </div>
        </>
      )}

      {estado === 'buscando' && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>🔎 Buscando precios reales en la web… puede tardar hasta un minuto.</p>
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
