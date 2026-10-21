import { describe, expect, it } from "vitest";
import { getPreviousIncome, getSavingsSummary } from "../src/calc";
import type { AppData, Expense } from "../src/types";

function makeExpense(id: string, date: string, amountCents: number): Expense {
  return {
    id,
    amountCents,
    category: "otros",
    date,
    note: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeData(
  incomeByMonth: Record<string, number>,
  expenses: Expense[] = [],
): AppData {
  return { version: 1, expenses, income: { byMonth: incomeByMonth } };
}

describe("getSavingsSummary", () => {
  it("calcula ahorro y porcentaje con sueldo registrado", () => {
    const data = makeData({ "2026-10": 200000 }, [makeExpense("a", "2026-10-05", 50000)]);
    const result = getSavingsSummary(data, "2026-10");
    expect(result.incomeCents).toBe(200000);
    expect(result.spentCents).toBe(50000);
    expect(result.savedCents).toBe(150000);
    expect(result.savingsPct).toBeCloseTo(75);
    expect(result.isDeficit).toBe(false);
  });

  it("ignora los gastos de otros meses", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "2026-09-30", 90000),
      makeExpense("b", "2026-10-01", 10000),
    ]);
    expect(getSavingsSummary(data, "2026-10").savedCents).toBe(90000);
  });

  it("devuelve null (no 0) si el mes no tiene sueldo", () => {
    const data = makeData({}, [makeExpense("a", "2026-10-05", 5000)]);
    const result = getSavingsSummary(data, "2026-10");
    expect(result.incomeCents).toBeNull();
    expect(result.savedCents).toBeNull();
    expect(result.savingsPct).toBeNull();
    expect(result.isDeficit).toBe(false);
    expect(result.spentCents).toBe(5000);
  });

  it("detecta el déficit cuando se gasta más que el sueldo", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "2026-10-05", 120000),
    ]);
    const result = getSavingsSummary(data, "2026-10");
    expect(result.savedCents).toBe(-20000);
    expect(result.savingsPct).toBeCloseTo(-20);
    expect(result.isDeficit).toBe(true);
  });

  it("no hay déficit si se gasta exactamente el sueldo", () => {
    const data = makeData({ "2026-10": 100000 }, [
      makeExpense("a", "2026-10-05", 100000),
    ]);
    const result = getSavingsSummary(data, "2026-10");
    expect(result.savedCents).toBe(0);
    expect(result.savingsPct).toBeCloseTo(0);
    expect(result.isDeficit).toBe(false);
  });

  it("usa el sueldo propio de cada mes", () => {
    const data = makeData({ "2026-09": 210000, "2026-10": 238000 });
    expect(getSavingsSummary(data, "2026-09").incomeCents).toBe(210000);
    expect(getSavingsSummary(data, "2026-10").incomeCents).toBe(238000);
  });
});

describe("getPreviousIncome", () => {
  it("devuelve el sueldo más reciente anterior al mes", () => {
    const income = { byMonth: { "2026-08": 210000, "2026-10": 238000 } };
    expect(getPreviousIncome(income, "2026-11")).toEqual({
      month: "2026-10",
      cents: 238000,
    });
  });

  it("salta los meses sin sueldo (huecos)", () => {
    const income = { byMonth: { "2026-08": 210000, "2026-10": 238000 } };
    expect(getPreviousIncome(income, "2026-10")).toEqual({
      month: "2026-08",
      cents: 210000,
    });
  });

  it("no incluye el propio mes ni los posteriores", () => {
    const income = { byMonth: { "2026-10": 238000, "2026-12": 300000 } };
    expect(getPreviousIncome(income, "2026-10")).toBeNull();
  });

  it("devuelve null si no hay ningún sueldo", () => {
    expect(getPreviousIncome({ byMonth: {} }, "2026-10")).toBeNull();
  });

  it("funciona al cruzar de año", () => {
    const income = { byMonth: { "2025-12": 200000 } };
    expect(getPreviousIncome(income, "2026-01")).toEqual({
      month: "2025-12",
      cents: 200000,
    });
  });
});
