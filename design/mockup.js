const screens = [...document.querySelectorAll("[data-screen]")];
const navLinks = [...document.querySelectorAll("[data-screen-link]")];
const headingMap = {
  inicio: "Inicio",
  anadir: "Añadir movimiento",
  movimientos: "Movimientos",
  analisis: "Análisis",
  mas: "Más",
  ingresos: "Ingresos",
  recurrentes: "Gastos fijos",
  metas: "Metas de ahorro",
  presupuestos: "Presupuestos",
  carteras: "Carteras",
  copias: "Copias de seguridad",
};

function showScreen(id, push = true) {
  const target = screens.find((screen) => screen.dataset.screen === id);
  if (!target) return;
  for (const screen of screens) screen.hidden = screen !== target;
  const primary =
    id === "anadir"
      ? "movimientos"
      : ["inicio", "movimientos", "analisis"].includes(id)
        ? id
        : "mas";
  for (const link of navLinks) {
    const active = link.dataset.screenLink === primary;
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `Boti · ${headingMap[id] ?? "Maqueta"}`;
  target.querySelector("h2, h1")?.focus({ preventScroll: true });
  if (push) history.pushState({ screen: id }, "", `#${id}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-screen-link]");
  if (link) {
    event.preventDefault();
    showScreen(link.dataset.screenLink);
    return;
  }
  const retry = event.target.closest("[data-retry]");
  if (retry) {
    const status = retry.closest(".state-example")?.querySelector("[aria-live]");
    if (status) status.textContent = "Maqueta: el estado se ha vuelto a cargar.";
    return;
  }
  const chip = event.target.closest(".category-chip");
  if (chip) {
    for (const option of chip.parentElement.querySelectorAll(".category-chip")) {
      option.setAttribute("aria-pressed", String(option === chip));
    }
    return;
  }
  const eye = event.target.closest("[data-eye]");
  if (eye) {
    const pressed = eye.getAttribute("aria-pressed") !== "true";
    eye.setAttribute("aria-pressed", String(pressed));
    eye.setAttribute("aria-label", pressed ? "Mostrar importes" : "Ocultar importes");
    document.querySelectorAll(".maskable").forEach((amount) => {
      amount.classList.toggle("is-masked", pressed);
    });
    return;
  }
  const bar = event.target.closest(".month-bar");
  if (bar && event.pointerType === "touch") {
    const opening = bar.dataset.open !== "true";
    document.querySelectorAll(".month-bar[data-open=true]").forEach((item) => {
      item.dataset.open = "false";
      item.setAttribute("aria-expanded", "false");
    });
    bar.dataset.open = String(opening);
    bar.setAttribute("aria-expanded", String(opening));
    event.preventDefault();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || event.target.closest(".month-bar")) return;
  document.querySelectorAll(".month-bar[data-open=true]").forEach((bar) => {
    bar.dataset.open = "false";
    bar.setAttribute("aria-expanded", "false");
  });
});

for (const bar of document.querySelectorAll(".month-bar")) {
  bar.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") bar.setAttribute("aria-expanded", "true");
  });
  bar.addEventListener("pointerleave", (event) => {
    if (
      event.pointerType === "mouse" &&
      !bar.matches(":focus") &&
      bar.dataset.open !== "true"
    ) {
      bar.setAttribute("aria-expanded", "false");
    }
  });
  bar.addEventListener("focus", () => bar.setAttribute("aria-expanded", "true"));
  bar.addEventListener("blur", () => {
    if (bar.dataset.open !== "true") bar.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".month-bar[data-open=true]").forEach((bar) => {
      bar.dataset.open = "false";
      bar.setAttribute("aria-expanded", "false");
    });
  }
});
window.addEventListener("popstate", () =>
  showScreen(location.hash.slice(1) || "inicio", false),
);
showScreen(location.hash.slice(1) || "inicio", false);
