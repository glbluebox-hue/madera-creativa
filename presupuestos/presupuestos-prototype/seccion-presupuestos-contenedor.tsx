import { useState, useEffect } from 'react';
import { SeccionPresupuestos } from './seccion-presupuestos.js';
import { PresupuestosListaGlobal } from './presupuestos-lista-global.js';
import type { Empresa } from './use-empresa.js';
import styles from './styles.module.css';

export type SeccionPresupuestosContenedorProps = {
  onAbrirCliente: (id: string) => void;
  clientes: { id: string; nombre: string }[];
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Al entrar con esta bandera activa, salta directo a "Documentos" con el selector de cliente abierto (nav "Crear presupuesto" del sidebar). */
  abrirCreadorAlEntrar?: boolean;
  /** Se llama una vez consumida la bandera anterior, para que no se repita en la siguiente visita a esta sección. */
  onCreadorAbierto?: () => void;
};

type SubPestana = 'resumen' | 'documentos';

/**
 * Contenedor de la sección global "Presupuestos" (Fase 6) — envuelve dos
 * vistas independientes que ya existían por separado: el resumen financiero
 * (`SeccionPresupuestos`, derivado de `Cliente.presupuesto`/`estado`, sin
 * tocar) y la lista de documentos reales (`PresupuestosListaGlobal`,
 * `PresupuestoMC` de todos los clientes, con el editor de lienzo).
 */
export function SeccionPresupuestosContenedor({ onAbrirCliente, clientes, empresa, onActualizarEmpresa, abrirCreadorAlEntrar, onCreadorAbierto }: SeccionPresupuestosContenedorProps) {
  const [pestana, setPestana] = useState<SubPestana>(abrirCreadorAlEntrar ? 'documentos' : 'resumen');

  useEffect(() => {
    if (abrirCreadorAlEntrar) setPestana('documentos');
  }, [abrirCreadorAlEntrar]);

  return (
    <div>
      <div className={styles.fichaTabs}>
        <button
          className={`${styles.fichaTab} ${pestana === 'resumen' ? styles.fichaTabActiva : ''}`}
          onClick={() => setPestana('resumen')}
        >
          Resumen financiero
        </button>
        <button
          className={`${styles.fichaTab} ${pestana === 'documentos' ? styles.fichaTabActiva : ''}`}
          onClick={() => setPestana('documentos')}
        >
          Documentos
        </button>
      </div>

      {pestana === 'resumen' && <SeccionPresupuestos onAbrirCliente={onAbrirCliente} />}
      {pestana === 'documentos' && (
        <PresupuestosListaGlobal
          clientes={clientes}
          empresa={empresa}
          onActualizarEmpresa={onActualizarEmpresa}
          onAbrirCliente={onAbrirCliente}
          abrirSelectorInicial={abrirCreadorAlEntrar}
          onSelectorInicialAbierto={onCreadorAbierto}
        />
      )}
    </div>
  );
}
