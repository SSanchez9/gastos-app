// Maqueta estilo B: inserta los iconos, la navegación y la cabecera comunes
// para que cada pantalla solo contenga su propio contenido.
(() => {
  const icons = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    chart: '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.5V13z"/><path d="M14.5 3.7a8.5 8.5 0 0 1 5.8 5.8h-5.8z"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.6 6.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M7 7l10 10M17 9v8H9"/>',
    "arrow-in": '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    "arrow-out": '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    jar: '<path d="M8 3h8M9 3v3.5a4 4 0 0 1-2 3.4A3.8 3.8 0 0 0 5 13.3V18a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-4.7a3.8 3.8 0 0 0-2-3.4 4 4 0 0 1-2-3.4V3"/>',
    gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l3.5-3.5"/>',
    cart: '<path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    social: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M4 11h16"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
    tag: '<path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9z"/><path d="M8 8h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4 4 4M5 12h11"/>',
    repeat: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  };
  const sprite =
    '<svg class="sprite" aria-hidden="true" focusable="false">' +
    Object.entries(icons)
      .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`)
      .join("") +
    "</svg>";
  document.body.insertAdjacentHTML("afterbegin", sprite);

  const icon = (id, cls = "icon") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const current = document.body.dataset.nav;
  const links = [
    ["inicio", "Inicio", "home", "inicio.html", 1],
    ["movimientos", "Movimientos", "list", "movimientos-1.html", 2],
    ["analisis", "Análisis", "chart", "analisis-1.html", 3],
    ["mas", "Más", "more", "mas-1.html", 4],
  ];
  const side = document.querySelector("[data-shell-side]");
  if (side) {
    side.innerHTML = `
      <p class="brand"><span class="brand__mark" aria-hidden="true"></span>boti</p>
      <nav class="nav" aria-label="Principal" data-bottom-nav>
        <ul class="nav__list">
          ${links
            .map(
              ([key, label, ic, href, n]) => `
            <li class="nav__item nav__item--${n}">
              <a class="nav__link" href="${href}"${key === current ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>
            </li>`,
            )
            .join("")}
          <li class="nav__item nav__item--add">
            <a class="nav__add" href="anadir-1.html">${icon("plus")}<span class="nav__add-text">Añadir movimiento</span></a>
          </li>
        </ul>
      </nav>`;
  }

  for (const top of document.querySelectorAll("[data-shell-top]")) {
    const { title, subtitle, back, backLabel } = top.dataset;
    const month = top.hasAttribute("data-month")
      ? `<div class="month" role="group" aria-label="Mes seleccionado">
          <button class="round-btn" type="button" aria-label="Mes anterior">${icon("left")}</button>
          <p class="month__label">noviembre 2026</p>
          <button class="round-btn" type="button" aria-label="Mes siguiente">${icon("right")}</button>
        </div>`
      : "";
    const mask = top.hasAttribute("data-mask")
      ? `<button class="round-btn mask-btn" type="button" aria-pressed="false" aria-label="Ocultar importes" data-mask-toggle>
          ${icon("eye", "icon icon--eye")}${icon("eye-off", "icon icon--eye-off")}
        </button>`
      : "";
    const backLink = back ? `<a class="back-link" href="${back}">${icon("back", "icon icon--sm")}${backLabel || "Volver"}</a>` : "";
    top.classList.add("top", "top--page");
    top.innerHTML = `
      <div class="top__title">
        ${top.hasAttribute("data-hide-title") ? '<p class="brand hide-desktop"><span class="brand__mark" aria-hidden="true"></span>boti</p>' : ""}
        ${backLink}
        <h1 class="page-title${top.hasAttribute("data-hide-title") ? " sr-only" : ""}">${title}</h1>
        ${subtitle ? `<p class="page-sub">${subtitle}</p>` : ""}
      </div>
      ${month}${mask}`;
  }

  window.bIcon = icon;
})();
