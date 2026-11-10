import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

for (const screen of ["movements", "analysis"]) {
  await page.goto(`http://127.0.0.1:5173/gastos-app/#${screen}`);
  await page.waitForTimeout(250);
  await page.evaluate((activeScreen) => {
    if (activeScreen === "movements") {
      const rows = document.querySelector("#expense-rows");
      if (rows) {
        rows.innerHTML = Array.from({ length: 20 }, (_, index) => `
          <tr>
            <td class="expense-row__details" colspan="3">
              <div class="expense-row__heading"><span class="dot"></span><span class="expense-row__category">Supermercado</span></div>
              <span class="expense-row__meta">5 nov 2026 · compra larga</span>
            </td>
            <td class="expense-row__amount">43,20 €</td>
            <td class="expense-row__actions"><div class="actions">
              <button class="button button--secondary button--small expense-action expense-action--edit" aria-label="Editar gasto"><svg></svg></button>
              <button class="button button--secondary button--small expense-action expense-action--delete" aria-label="Eliminar gasto"><svg></svg></button>
            </div></td>
          </tr>`).join("");
      }
    } else {
      const chart = document.querySelector("#chart");
      if (chart) chart.innerHTML = '<svg class="chart__svg" viewBox="0 0 200 200" style="width: 9rem"></svg><span class="chart__tooltip" hidden></span>';
      const legend = document.querySelector("#chart-legend");
      if (legend) legend.innerHTML = Array.from({ length: 8 }, () => '<li class="legend__item"><span class="dot"></span><span class="breakdown__name">Supermercado</span><span class="breakdown__amount">1.200,00 €</span><span class="breakdown__pct">45,2 %</span></li>').join("");
      const breakdown = document.querySelector("#category-totals");
      if (breakdown) breakdown.innerHTML = Array.from({ length: 8 }, () => '<li class="breakdown__item"><div class="breakdown__head"><span class="breakdown__name">Supermercado</span><span class="breakdown__amount">1.200,00 €</span><span class="breakdown__pct">45,2 %</span></div></li>').join("");
    }
  }, screen);
  const result = await page.evaluate(() => ({
    screen: location.hash,
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (element.scrollWidth > element.clientWidth + 1 || rect.right > innerWidth + 1 || rect.left < -1);
      })
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        id: element.id,
        client: element.clientWidth,
        scroll: element.scrollWidth,
        rect: {
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          width: element.getBoundingClientRect().width,
        },
      }))
      .slice(0, 25),
  }));
  console.log(JSON.stringify(result));
}

await browser.close();
