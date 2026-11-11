// Prototipo estilo B: rutas por hash (#movimientos-2), selector de propuesta,
// diálogos de añadir movimiento y pequeñas interacciones de maqueta.
(() => {
  const screens = window.PROTO_SCREENS;
  const views = new Map([...document.querySelectorAll("[data-view]")].map((v) => [v.dataset.view, v]));
  const overlays = new Map([...document.querySelectorAll("[data-overlay]")].map((o) => [o.dataset.overlay, o]));
  const app = document.querySelector(".app");
  const bar = document.querySelector(".proto-bar");
  const barLabel = bar.querySelector("[data-proto-label]");
  const barVariants = bar.querySelector("[data-proto-variants]");
  const toast = document.querySelector("[data-proto-toast]");
  const chosen = Object.fromEntries(Object.keys(screens).map((s) => [s, 1]));
  let base = "inicio";

  const split = (name) => {
    const m = /^(.*)-(\d)$/.exec(name);
    return m ? { screen: m[1], variant: Number(m[2]) } : { screen: name, variant: 0 };
  };
  const resolveName = (raw) => {
    const name = raw || "inicio";
    if (views.has(name) || overlays.has(name)) return name;
    if (screens[name]) return screens[name].variants.length > 1 ? `${name}-${chosen[name]}` : name;
    return null;
  };

  const syncNav = () => {
    const nav = views.get(base).dataset.nav;
    for (const link of document.querySelectorAll(".nav__link, .nav__add")) {
      const target = link.getAttribute("href").replace(/^#/, "").replace(/(-\d)?\.html$/, "");
      const { screen } = split(target);
      link.setAttribute("href", `#${screen}`);
      if (link.classList.contains("nav__link")) {
        if (screen === nav) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
    }
  };

  const syncBar = (name) => {
    const { screen, variant } = split(name);
    const info = screens[screen];
    const title = info.variants[variant - 1];
    barLabel.textContent = title ? `${info.label}: propuesta ${variant}, ${title}` : `${info.label}: nueva versión`;
    barVariants.hidden = info.variants.length < 2;
    for (const b of barVariants.querySelectorAll("[data-variant]")) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.variant) === variant));
      b.dataset.screen = screen;
    }
  };

  const closePops = (except) => {
    for (const btn of document.querySelectorAll("[aria-controls][aria-expanded]")) {
      const pop = document.getElementById(btn.getAttribute("aria-controls"));
      if (!pop || pop === except) continue;
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  };

  const render = () => {
    const name = resolveName(location.hash.replace(/^#/, ""));
    if (!name) {
      location.replace("#inicio");
      return;
    }
    const { screen, variant } = split(name);
    if (variant) chosen[screen] = variant;
    closePops();

    const isOverlay = overlays.has(name);
    for (const [key, o] of overlays) o.hidden = key !== name;
    app.inert = isOverlay;
    if (!isOverlay) {
      const changed = base !== name;
      base = name;
      for (const [key, v] of views) v.hidden = key !== base;
      if (changed) {
        window.scrollTo(0, 0);
        const heading = views.get(base).querySelector(".page-title");
        if (heading && document.activeElement !== document.body) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
    } else {
      overlays.get(name).querySelector(".dialog [data-close]")?.focus();
    }
    syncNav();
    syncBar(name);
    document.title = `${screens[screen].label} · Estilo B · Prototipo`;
  };

  // Filtro por categoría: oculta las filas de otras categorías y los días vacíos.
  const filterRows = (btn) => {
    const view = btn.closest("[data-view]");
    const all = btn === btn.parentElement.firstElementChild;
    const cat = btn.textContent.trim();
    for (const row of view.querySelectorAll(".row")) {
      const meta = row.querySelector(".row__meta")?.textContent.trim();
      row.hidden = !all && meta !== cat;
    }
    for (const day of view.querySelectorAll(".day")) {
      day.hidden = !day.querySelector(".row:not([hidden])");
    }
  };

  const closeOverlay = () => {
    location.hash = `#${base}`;
  };

  // Selector de propuesta
  barVariants.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-variant]");
    if (btn) location.hash = `#${btn.dataset.screen}-${btn.dataset.variant}`;
  });

  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (close) {
      e.preventDefault();
      closeOverlay();
      return;
    }
    const scrim = e.target.closest(".scrim");
    if (scrim && e.target === scrim) {
      closeOverlay();
      return;
    }
    // Menú contextual de una fila
    const opener = e.target.closest("[aria-controls][aria-expanded]");
    if (opener) {
      const pop = document.getElementById(opener.getAttribute("aria-controls"));
      if (pop) {
        const open = pop.hidden;
        closePops(pop);
        pop.hidden = !open;
        opener.setAttribute("aria-expanded", String(open));
        if (open) pop.querySelector("button")?.focus();
        return;
      }
    }
    if (!e.target.closest(".pop")) closePops();
    // Filtros y controles segmentados: selección única dentro de su grupo
    const toggle = e.target.closest(".filter, .seg__btn[aria-pressed]");
    if (toggle && !toggle.closest("[data-proto-variants]")) {
      const group = toggle.closest("[role='group']");
      for (const b of group.querySelectorAll("[aria-pressed]")) b.setAttribute("aria-pressed", String(b === toggle));
      if (toggle.classList.contains("filter")) filterRows(toggle);
    }
    // Enlaces internos de una pantalla (por ejemplo, filas que abren su detalle)
    const local = e.target.closest("[data-local]");
    if (local) {
      e.preventDefault();
      const row = local.closest(".row");
      const list = row?.closest(".rows");
      if (row && list) {
        for (const r of list.querySelectorAll(".row--selected")) r.classList.remove("row--selected");
        for (const a of list.querySelectorAll("[aria-current]")) a.removeAttribute("aria-current");
        row.classList.add("row--selected");
        local.setAttribute("aria-current", "true");
      }
    }
  });

  // Los formularios de la maqueta no guardan nada
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    toast.textContent = "Es una maqueta: no se guarda ningún dato.";
    toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (toast.hidden = true), 2600);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".pop:not([hidden])")) closePops();
    else if (overlays.has(resolveName(location.hash.slice(1)))) closeOverlay();
  });

  for (const pop of document.querySelectorAll(".pop")) pop.hidden = true;
  window.addEventListener("hashchange", render);
  render();
})();
