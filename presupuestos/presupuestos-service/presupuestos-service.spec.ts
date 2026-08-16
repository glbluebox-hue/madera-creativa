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

  it('debería exponer los métodos de gestión de contratos (Motor Documental, Incremento 12)', () => {
    const presupuestosService = PresupuestosService.from();
    expect(typeof presupuestosService.listarContratosDeCliente).toBe('function');
    expect(typeof presupuestosService.guardarContrato).toBe('function');
    expect(typeof presupuestosService.borrarContrato).toBe('function');
  });
});
