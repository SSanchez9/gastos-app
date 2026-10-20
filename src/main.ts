import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

// Provisional (fase 1): evita que los formularios recarguen la página.
// Se sustituirá por la lógica real en las fases 3, 5 y 6.
document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
  form.addEventListener("submit", (event) => event.preventDefault());
});
