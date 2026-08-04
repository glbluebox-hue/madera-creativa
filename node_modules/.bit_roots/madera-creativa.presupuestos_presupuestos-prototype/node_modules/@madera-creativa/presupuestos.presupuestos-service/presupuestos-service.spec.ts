import { PresupuestosService } from './presupuestos-service.js';

describe('presupuestos service', () => {
  it('debería crear una instancia del servicio', () => {
    const presupuestosService = PresupuestosService.from();
    expect(presupuestosService).toBeInstanceOf(PresupuestosService);
  });

  it('debería exponer los métodos de gestión de clientes', () => {
    const presupuestosService = PresupuestosService.from();
    expect(typeof presupuestosService.listarClientes).toBe('function');
    expect(typeof presupuestosService.guardarCliente).toBe('function');
    expect(typeof presupuestosService.borrarCliente).toBe('function');
  });
});
