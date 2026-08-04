import { Platform } from '@bitdev/platforms.platform';

const PresupuestosWeb = import.meta.resolve('@madera-creativa/presupuestos.presupuestos-prototype');
const PresupuestosService = import.meta.resolve('@madera-creativa/presupuestos.presupuestos-service');
const PlatformGateway = import.meta.resolve('@bitdev/platforms.backend.gateway-server');

/**
 * Plataforma Madera Creativa: compone la app web React con el servicio
 * backend de presupuestos en una sola unidad desplegable.
 */
export const PresupuestosPlatform = Platform.from({
  name: 'presupuestos-platform',

  frontends: {
    main: PresupuestosWeb,
    mainPortRange: [3000, 3100],
  },

  backends: {
    // gateway por defecto: enruta /api/{servicio}/... al backend correspondiente.
    main: PlatformGateway,
    services: [PresupuestosService],
  },
});

export default PresupuestosPlatform;
