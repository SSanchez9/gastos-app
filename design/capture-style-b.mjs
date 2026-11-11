// Capturas de las pantallas del estilo B en modo claro: node design/capture-style-b.mjs [pagina ...]
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const output = resolve(root, "design/screenshots/style-b");
await mkdir(output, { recursive: true });
const all = ["inicio"];
for (const screen of ["movimientos", "analisis", "mas", "gastos-fijos", "ingresos", "anadir"]) {
  for (const n of [1, 2, 3]) all.push(`${screen}-${n}`);
}
const pages = process.argv.slice(2).length ? process.argv.slice(2) : all;
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});

for (const name of pages) {
  for (const [viewport, label] of [
    [{ width: 1440, height: 1000 }, "escritorio-1440"],
    [{ width: 390, height: 844 }, "movil-390"],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(pathToFileURL(resolve(root, `design/style-b/${name}.html`)).href);
    await page.evaluate(() => document.fonts.ready);
    const isDialog = name.startsWith("anadir");
    if (label.startsWith("movil") && !isDialog) {
      // La barra inferior es fija; en la captura de página completa se ancla al final.
      await page.addStyleTag({ content: "body{position:relative}[data-bottom-nav]{position:absolute!important}" });
    }
    await page.screenshot({ path: resolve(output, `${name}-${label}.png`), fullPage: !isDialog });
    await page.close();
  }
}
await browser.close();
