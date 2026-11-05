import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const output = resolve(root, "design/screenshots/iteracion-2");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
});
const screenIds = [
  "inicio", "anadir", "movimientos", "analisis", "mas", "ingresos",
  "recurrentes", "metas", "presupuestos", "carteras", "copias",
];

for (const [file, viewport, prefix] of [
  ["mobile.html", { width: 390, height: 844 }, "movil-390"],
  ["desktop.html", { width: 1440, height: 1000 }, "escritorio-1440"],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: "light" });
  await page.goto(pathToFileURL(resolve(root, "design", file)).href);
  if (prefix.startsWith("movil")) {
    await page.addStyleTag({ content: "@media(max-width:920px){.mobile-nav{position:static!important;margin-top:10px}.stage{padding-bottom:20px!important}}" });
  }
  for (const id of screenIds) {
    await page.evaluate((screenId) => {
      window.showScreen(screenId, false);
      document.querySelectorAll(`[data-screen="${screenId}"] details`).forEach((item) => { item.open = true; });
    }, id);
    await page.screenshot({ path: resolve(output, `${prefix}-${id}-claro.png`), fullPage: true });
    if (id === "inicio" || id === "analisis") {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: resolve(output, `${prefix}-${id}-oscuro.png`), fullPage: true });
      await page.emulateMedia({ colorScheme: "light" });
    }
  }
  await page.close();
}
await browser.close();
