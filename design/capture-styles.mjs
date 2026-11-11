// Capturas de las propuestas de estilo: node design/capture-styles.mjs [a b c]
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const output = resolve(root, "design/screenshots");
await mkdir(output, { recursive: true });
const styles = process.argv.slice(2).length ? process.argv.slice(2) : ["a", "b", "c"];
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});

for (const style of styles) {
  for (const [viewport, label] of [
    [{ width: 1440, height: 1000 }, "escritorio-1440"],
    [{ width: 390, height: 844 }, "movil-390"],
  ]) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(pathToFileURL(resolve(root, `design/style-${style}/${style === "b" ? "inicio-v1" : "desktop"}.html`)).href);
      await page.evaluate(() => document.fonts.ready);
      if (label.startsWith("movil")) {
        // La barra inferior es fija; en la captura de página completa se ancla al final.
        await page.addStyleTag({ content: "body{position:relative}[data-bottom-nav]{position:absolute!important}" });
      }
      const name = `style-${style}-${label}-${scheme === "light" ? "claro" : "oscuro"}.png`;
      await page.screenshot({ path: resolve(output, name), fullPage: true });
      await page.close();
    }
  }
}
await browser.close();
