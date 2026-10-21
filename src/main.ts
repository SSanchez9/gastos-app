import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import * as gastos from "./state";

declare global {
  interface Window {
    gastos?: typeof gastos;
  }
}

// Provisional: permite probar el estado desde la consola (solo en desarrollo).
if (import.meta.env.DEV) {
  window.gastos = gastos;
}

// Provisional (fase 2): evita que los formularios recarguen la página.
// Se sustituirá por la lógica real en las fases 3, 5 y 6.
document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
  form.addEventListener("submit", (event) => event.preventDefault());
});
