import { describe, expect, it } from "vitest";
import { getChartData } from "../src/calc";
import type { AppData, CategoryKey, Expense } from "../src/types";

function makeExpense(
  id: string,
  category: CategoryKey,
  amountCents: number,
  date = "2026-10-10",
): Expense {
  return { id, amountCents, category, date, note: "", createdAt: 1, updatedAt: 1 };
}

function makeData(incomeByMonth: Record<string, number>, expenses: Expense[]): AppData {
  return { version: 1, expenses, income: { byMonth: incomeByMonth } };
}

const sumTenths = (pcts: number[]): number =>
  pcts.reduce((sum, pct) => sum + Math.round(pct * 10), 0);

describe("getChartData", () => {
  it("reparte el sueldo entre categorías y ahorro", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "supermercado", 40000),
      makeExpense("b", "casa", 10000),
    ]);
    const chart = getChartData(data, "2026-10");

    expect(chart.kind).toBe("income");
    expect(chart.totalCents).toBe(100000);
    expect(chart.slices.map((s) => s.key)).toEqual(["supermercado", "casa", "ahorro"]);
    expect(chart.slices.map((s) => s.pct)).toEqual([40, 10, 50]);
  });

  it("las porciones suman siempre 100 % aunque haya restos", () => {
    const data = makeData({ "2026-10": 30003 }, [
      makeExpense("a", "personal", 10000),
      makeExpense("b", "social", 10000),
    ]);
    const chart = getChartData(data, "2026-10");
    expect(sumTenths(chart.slices.map((s) => s.pct))).toBe(1000);
  });

  it("sin gastos y con sueldo, el ahorro es el 100 %", () => {
    const chart = getChartData(makeData({ "2026-10": 200000 }, []), "2026-10");
    expect(chart.kind).toBe("income");
    expect(chart.slices).toEqual([{ key: "ahorro", cents: 200000, pct: 100 }]);
  });

  it("si se gasta justo el sueldo no hay porción de ahorro", () => {
    const data = makeData({ "2026-10": 50000 }, [makeExpense("a", "alquiler", 50000)]);
    const chart = getChartData(data, "2026-10");
    expect(chart.kind).toBe("income");
    expect(chart.slices.map((s) => s.key)).toEqual(["alquiler"]);
    expect(chart.slices[0]?.pct).toBe(100);
  });

  it("con déficit usa lo gastado como base y no hay ahorro", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "alquiler", 90000),
      makeExpense("b", "gasolina", 30000),
    ]);
    const chart = getChartData(data, "2026-10");

    expect(chart.kind).toBe("deficit");
    expect(chart.totalCents).toBe(120000);
    expect(chart.slices.map((s) => s.key)).toEqual(["alquiler", "gasolina"]);
    expect(chart.slices.map((s) => s.pct)).toEqual([75, 25]);
  });

  it("sin sueldo usa lo gastado como base", () => {
    const data = makeData({}, [makeExpense("a", "coche", 8000)]);
    const chart = getChartData(data, "2026-10");
    expect(chart.kind).toBe("no-income");
    expect(chart.totalCents).toBe(8000);
    expect(chart.slices).toEqual([{ key: "coche", cents: 8000, pct: 100 }]);
  });

  it("sin sueldo ni gastos está vacío", () => {
    const chart = getChartData(makeData({}, []), "2026-10");
    expect(chart.kind).toBe("empty");
    expect(chart.slices).toEqual([]);
  });

  it("ignora los gastos y sueldos de otros meses", () => {
    const data = makeData({ "2026-09": 500000 }, [
      makeExpense("a", "casa", 20000, "2026-09-15"),
    ]);
    expect(getChartData(data, "2026-10").kind).toBe("empty");
  });

  it("ordena las categorías de mayor a menor y deja el ahorro al final", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "casa", 5000),
      makeExpense("b", "alquiler", 30000),
    ]);
    const keys = getChartData(data, "2026-10").slices.map((s) => s.key);
    expect(keys).toEqual(["alquiler", "casa", "ahorro"]);
  });
});
