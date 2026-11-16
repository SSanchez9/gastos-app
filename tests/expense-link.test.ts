import { describe, expect, it } from "vitest";
import { parseExpenseLink, stripExpenseLinkParams } from "../src/expense-link";

describe("parseExpenseLink", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["12,50 €", 1250],
    ["€12.50", 1250],
    ["1.234,56", 123456],
    ["7", 700],
  ])("acepta el importe %s", (importe, cents) => {
    const search = `?nuevo=1&importe=${encodeURIComponent(importe)}`;
    expect(parseExpenseLink(search)?.amountCents).toBe(cents);
  });

  it("lee comercio y fecha", () => {
    expect(
      parseExpenseLink("?nuevo=1&importe=12,50&comercio=Mercadona&fecha=2026-11-17"),
    ).toEqual({ amountCents: 1250, note: "Mercadona", date: "2026-11-17" });
  });

  it.each(["2026-02-30", "17/11/2026", "2026-13-01", ""])(
    "ignora la fecha no válida %j",
    (fecha) => {
      expect(parseExpenseLink(`?nuevo=1&importe=5&fecha=${fecha}`)?.date).toBeNull();
    },
  );

  it("sin fecha devuelve null para usar la de hoy", () => {
    expect(parseExpenseLink("?nuevo=1&importe=5")?.date).toBeNull();
  });

  it("sin comercio o vacío deja la nota vacía", () => {
    expect(parseExpenseLink("?nuevo=1&importe=5")?.note).toBe("");
    expect(parseExpenseLink("?nuevo=1&importe=5&comercio=%20%20")?.note).toBe("");
  });

  it("normaliza los espacios del comercio", () => {
    const search = `?nuevo=1&importe=5&comercio=${encodeURIComponent("  El   Corte\tInglés  ")}`;
    expect(parseExpenseLink(search)?.note).toBe("El Corte Inglés");
  });

  it("recorta el comercio a 120 caracteres", () => {
    const note = parseExpenseLink(`?nuevo=1&importe=5&comercio=${"a".repeat(200)}`)?.note;
    expect(note).toHaveLength(120);
  });

  it("ignora el enlace sin «nuevo»", () => {
    expect(parseExpenseLink("?importe=12,50&comercio=Mercadona")).toBeNull();
    expect(parseExpenseLink("")).toBeNull();
  });

  it.each(["0", "0,00", "abc", ""])("ignora el importe %j", (importe) => {
    const search = `?nuevo=1&importe=${encodeURIComponent(importe)}`;
    expect(parseExpenseLink(search)).toBeNull();
  });

  it("descarta el signo: un cargo siempre es un gasto", () => {
    expect(parseExpenseLink("?nuevo=1&importe=-5")?.amountCents).toBe(500);
  });

  it("ignora el enlace sin importe", () => {
    expect(parseExpenseLink("?nuevo=1&comercio=Mercadona")).toBeNull();
  });
});

describe("stripExpenseLinkParams", () => {
  it("quita solo los parámetros del enlace", () => {
    expect(
      stripExpenseLinkParams(
        "?nuevo=1&importe=12,50&comercio=Mercadona&fecha=2026-11-17&utm=x",
      ),
    ).toBe("?utm=x");
  });

  it("devuelve cadena vacía si no queda nada", () => {
    expect(stripExpenseLinkParams("?nuevo=1&importe=5")).toBe("");
    expect(stripExpenseLinkParams("")).toBe("");
  });

  it("deja igual una búsqueda sin parámetros del enlace", () => {
    expect(stripExpenseLinkParams("?a=1&b=2")).toBe("?a=1&b=2");
  });
});
