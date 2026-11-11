// Maqueta: alterna la ocultación de importes. Los botones conservan su nombre
// accesible y comunican el estado con aria-pressed; si hay varios (una
// cabecera por pantalla en el prototipo), todos comparten el mismo estado.
(() => {
  const toggles = [...document.querySelectorAll("[data-mask-toggle]")];
  if (!toggles.length) return;
  const masked = '<span aria-hidden="true">•••• €</span><span class="sr-only">Importe oculto</span>';

  const apply = (hide) => {
    for (const t of toggles) t.setAttribute("aria-pressed", String(hide));
    document.documentElement.toggleAttribute("data-masked", hide);
    for (const el of document.querySelectorAll(".money")) {
      if (hide && el.dataset.full === undefined) {
        el.dataset.full = el.innerHTML;
        el.innerHTML = masked;
      } else if (!hide && el.dataset.full !== undefined) {
        el.innerHTML = el.dataset.full;
        delete el.dataset.full;
      }
    }
  };

  for (const t of toggles) {
    t.addEventListener("click", () => apply(t.getAttribute("aria-pressed") !== "true"));
  }
})();
