// Genera style-b/desktop.html: un prototipo navegable con todas las pantallas
// del estilo B. Las fuentes son los HTML de cada pantalla (inicio.html,
// movimientos-1.html…). Uso: node design/style-b/build-prototype.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export const screens = {
  inicio: { label: "Inicio", variants: [null] },
  movimientos: { label: "Movimientos", variants: ["Por días", "Lista y detalle", "Por categoría"] },
  analisis: { label: "Análisis", variants: ["Informe", "El mes contado", "Tarjetas por categoría"] },
  mas: { label: "Más", variants: ["Lista agrupada", "Tarjetas con resumen", "Ajustes y accesos"] },
  "gastos-fijos": { label: "Gastos fijos", variants: ["Calendario", "Línea de tiempo", "Tarjetas"] },
  ingresos: { label: "Ingresos", variants: ["Formulario en línea", "Lista y panel", "Recibo"] },
  anadir: { label: "Añadir movimiento", variants: ["Rápido primero", "Importe y categorías", "Panel lateral"], overlay: true },
};

const between = (html, start, end) => {
  const i = html.indexOf(start);
  const j = html.lastIndexOf(end);
  if (i < 0 || j < 0) throw new Error(`No se encuentra ${start}`);
  return html.slice(i + start.length, j);
};

// Prefija los id de cada pantalla para que no choquen al convivir en un documento.
const scopeIds = (html, prefix) =>
  html
    .replace(/\b(id|for|aria-labelledby|aria-controls|aria-describedby)="([^"]+)"/g, (_, attr, value) =>
      `${attr}="${value
        .split(/\s+/)
        .map((v) => `${prefix}--${v}`)
        .join(" ")}"`,
    )
    .replace(/href="#((?!i-)[\w-]+)"/g,(_, id) => `href="#${prefix}--${id}" data-local`);

// Los enlaces entre pantallas pasan a ser rutas del prototipo.
const routeLinks = (html, screen) =>
  html.replace(/data-back="([\w-]+?)(?:-\d)?\.html"/g, 'data-back="#$1"').replace(/href="([\w-]+?)(?:-(\d))?\.html"/g, (_, target, n) =>
    target === screen && n ? `href="#${target}-${n}"` : `href="#${target}"`,
  );

const views = [];
const overlays = [];
for (const [screen, { variants, overlay }] of Object.entries(screens)) {
  for (const [i] of variants.entries()) {
    const name = variants.length > 1 ? `${screen}-${i + 1}` : screen;
    const html = await readFile(resolve(dir, `${name}.html`), "utf8");
    const nav = /<body data-nav="([\w-]+)"/.exec(html)[1];
    if (overlay) {
      const scrim = between(html, "</div>\n\n    ", "\n    <script");
      overlays.push(`<div class="overlay" data-overlay="${name}" hidden>\n${routeLinks(scopeIds(scrim, name), screen)}\n</div>`);
    } else {
      const main = between(html, '<main class="main">', "</main>");
      views.push(`<div class="view" data-view="${name}" data-nav="${nav}" hidden>${routeLinks(scopeIds(main, name), screen)}</div>`);
    }
  }
}

const page = `<!doctype html>
<html lang="es" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light" />
    <title>Estilo B · Prototipo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400..700&display=swap" />
    <link rel="stylesheet" href="style.css" />
    <link rel="stylesheet" href="screens.css" />
    <link rel="stylesheet" href="prototype.css" />
  </head>
  <!-- Archivo generado por build-prototype.mjs a partir de las pantallas sueltas. No editar a mano. -->
  <body data-nav="inicio">
    <div class="app">
      <aside class="side" data-shell-side></aside>
      <main class="main" id="contenido">
${views.join("\n")}
      </main>
    </div>
${overlays.join("\n")}
    <section class="proto-bar" aria-label="Propuestas de esta pantalla">
      <p class="proto-bar__label" data-proto-label></p>
      <div class="seg" role="group" aria-label="Elegir propuesta" data-proto-variants>
        <button class="seg__btn" type="button" data-variant="1" aria-pressed="true">1</button>
        <button class="seg__btn" type="button" data-variant="2" aria-pressed="false">2</button>
        <button class="seg__btn" type="button" data-variant="3" aria-pressed="false">3</button>
      </div>
    </section>
    <p class="proto-toast" role="status" aria-live="polite" data-proto-toast hidden></p>
    <script>window.PROTO_SCREENS = ${JSON.stringify(screens)};</script>
    <script src="shell.js"></script>
    <script src="prototype.js"></script>
    <script src="../shared/mask.js"></script>
  </body>
</html>
`;

await writeFile(resolve(dir, "desktop.html"), page);
console.log(`desktop.html: ${views.length} pantallas y ${overlays.length} diálogos`);
