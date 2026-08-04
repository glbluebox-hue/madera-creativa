import { MemoryRouter } from 'react-router-dom';
import { PresupuestosPrototype } from "./presupuestos-prototype.js";
    
export const PresupuestosPrototypeBasic = () => {
  return (
    <MemoryRouter>
      <PresupuestosPrototype />
    </MemoryRouter>
  );
}