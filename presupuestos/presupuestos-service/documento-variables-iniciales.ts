import { registrarVariable, type DefinicionVariable } from './documento-registro-variables.js';

/**
 * Variables del Incremento 4 — cuatro fuentes iniciales (cliente, empresa,
 * presupuesto, sistema). Deliberadamente no es una lista cerrada: una
 * fuente nueva (ej. `contrato` cuando exista ese tipo de documento) es
 * registrar entradas más aquí o en un archivo nuevo, nunca tocar
 * `documento-registro-variables.ts` (Regla de Oro 6).
 */

const formatoMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const definicionesVariablesIniciales: DefinicionVariable[] = [
  { clave: 'cliente.nombre', fuente: 'cliente', etiqueta: 'Nombre del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.nombre },
  { clave: 'cliente.email', fuente: 'cliente', etiqueta: 'Email del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.email },
  { clave: 'cliente.telefono', fuente: 'cliente', etiqueta: 'Teléfono del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.telefono },
  { clave: 'cliente.direccion', fuente: 'cliente', etiqueta: 'Dirección del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.direccion },

  { clave: 'empresa.nombre', fuente: 'empresa', etiqueta: 'Nombre de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.nombre },
  { clave: 'empresa.telefono', fuente: 'empresa', etiqueta: 'Teléfono de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.telefono },
  { clave: 'empresa.email', fuente: 'empresa', etiqueta: 'Email de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.email },
  { clave: 'empresa.iban', fuente: 'empresa', etiqueta: 'IBAN de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.iban },

  { clave: 'presupuesto.titulo', fuente: 'presupuesto', etiqueta: 'Título del presupuesto', tipoDato: 'texto', resolver: (c) => c.presupuesto?.titulo },
  {
    clave: 'presupuesto.total', fuente: 'presupuesto', etiqueta: 'Precio total', tipoDato: 'moneda',
    resolver: (c) => (c.presupuesto ? formatoMoneda.format(c.presupuesto.precioTotal) : undefined),
  },

  { clave: 'fecha', fuente: 'sistema', etiqueta: 'Fecha actual', tipoDato: 'fecha', resolver: (c) => formatoFecha.format(c.fecha ?? new Date()) },
];

export function registrarVariablesIniciales(): void {
  for (const definicion of definicionesVariablesIniciales) registrarVariable(definicion);
}
