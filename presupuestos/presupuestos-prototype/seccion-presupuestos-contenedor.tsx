import { useState } from 'react';
import { SeccionPresupuestos } from './seccion-presupuestos.js';
import { PresupuestosListaGlobal } from './presupuestos-lista-global.js';
import { PlantillasVista } from './plantillas-vista.js';
import type { Empresa } from './use-empresa.js';
import type { Proyecto } from './types.js';
import styles from './styles.module.css';

export type SeccionPresupuestosContenedorProps = {
  onAbrirCliente: (id: string) => void;
  clientes: { id: string; nombre: string }[];
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Crea un cliente y su primer proyecto reales sin salir de esta sección — usado por "+ Nuevo cliente" dentro del selector de "+ Crear presupuesto". */
  onCrearProyecto: (proyecto: Proyecto) => void;
};

type SubPestana = 'resumen' | 'documentos' | 'plantillas';

/**
 * Contenedor de la sección global "Presupuestos" (Fase 6) — envuelve dos
 * vistas independientes que ya existían por separado: el resumen financiero
 * (`SeccionPresupuestos`, derivado de `Cliente.presupuesto`/`estado`, sin
 * tocar) y la lista de documentos reales (`PresupuestosListaGlobal`,
 * `PresupuestoMC` de todos los clientes, con el editor correspondiente
 * abierto a través de `AbrirDocumento`).
 *
 * Pestaña por defecto: "Documentos", no "Resumen financiero" — es donde
 * vive "+ Crear presupuesto" y la lista real de documentos. Antes de este
 * cambio, entrar en "Presupuestos" desde el menú lateral aterrizaba en el
 * resumen (de solo lectura, sin ningún botón de creación), dejando el
 * editor del Motor Documental sin punto de entrada visible.
 */
export function SeccionPresupuestosContenedor({ onAbrirCliente, clientes, empresa, onActualizarEmpresa, onCrearProyecto }: SeccionPresupuestosContenedorProps) {
  const [pestana, setPestana] = useState<SubPestana>('documentos');

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
        <button
          className={`${styles.fichaTab} ${pestana === 'plantillas' ? styles.fichaTabActiva : ''}`}
          onClick={() => setPestana('plantillas')}
        >
          Plantillas
        </button>
      </div>

      {pestana === 'resumen' && <SeccionPresupuestos onAbrirCliente={onAbrirCliente} />}
      {pestana === 'documentos' && (
        <PresupuestosListaGlobal
          clientes={clientes}
          empresa={empresa}
          onActualizarEmpresa={onActualizarEmpresa}
          onAbrirCliente={onAbrirCliente}
          onCrearProyecto={onCrearProyecto}
        />
      )}
      {pestana === 'plantillas' && (
        <PlantillasVista empresa={empresa} onActualizarEmpresa={onActualizarEmpresa} />
      )}
    </div>
  );
}
