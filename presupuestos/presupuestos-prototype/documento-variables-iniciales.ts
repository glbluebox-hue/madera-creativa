import { registrarVariable } from './documento-registro-variables.js';
import { formatoEuro } from './calculos.js';

/**
 * Variables del Incremento 4 — espejo exacto de las claves registradas en
 * el backend (`documento-variables-iniciales.ts`) para que una plantilla
 * se comporte igual se resuelva donde se resuelva. Importado una sola vez
 * por efecto secundario desde `editor-documento.tsx`.
 */

const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

registrarVariable({ clave: 'cliente.nombre', fuente: 'cliente', etiqueta: 'Nombre del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.nombre });
registrarVariable({ clave: 'cliente.email', fuente: 'cliente', etiqueta: 'Email del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.email });
registrarVariable({ clave: 'cliente.telefono', fuente: 'cliente', etiqueta: 'Teléfono del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.telefono });
registrarVariable({ clave: 'cliente.direccion', fuente: 'cliente', etiqueta: 'Dirección del cliente', tipoDato: 'texto', resolver: (c) => c.cliente?.direccion });

registrarVariable({ clave: 'empresa.nombre', fuente: 'empresa', etiqueta: 'Nombre de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.nombre });
registrarVariable({ clave: 'empresa.telefono', fuente: 'empresa', etiqueta: 'Teléfono de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.telefono });
registrarVariable({ clave: 'empresa.email', fuente: 'empresa', etiqueta: 'Email de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.email });
registrarVariable({ clave: 'empresa.iban', fuente: 'empresa', etiqueta: 'IBAN de la empresa', tipoDato: 'texto', resolver: (c) => c.empresa?.iban });

registrarVariable({ clave: 'presupuesto.titulo', fuente: 'presupuesto', etiqueta: 'Título del presupuesto', tipoDato: 'texto', resolver: (c) => c.presupuesto?.titulo });
registrarVariable({
  clave: 'presupuesto.total', fuente: 'presupuesto', etiqueta: 'Precio total', tipoDato: 'moneda',
  resolver: (c) => (c.presupuesto ? formatoEuro(c.presupuesto.precioTotal) : undefined),
});

registrarVariable({ clave: 'fecha', fuente: 'sistema', etiqueta: 'Fecha actual', tipoDato: 'fecha', resolver: (c) => formatoFecha.format(c.fecha ?? new Date()) });
