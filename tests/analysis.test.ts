import { describe, expect, it } from "vitest";
import { categoryIncomeShares, lastSixMonthsSavingsTotals } from "../src/calc";
import type { AppData, Expense } from "../src/types";

function expense(id: string, category: Expense["category"], cents: number): Expense {
  return {
    id,
    category,
    amountCents: cents,
    date: "2026-11-05",
    note: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

const emptyData: AppData = {
  version: 1,
  expenses: [],
  income: { byMonth: {} },
};

describe("cálculos de análisis", () => {
  it("muestra el porcentaje de cada categoría sobre el ingreso, o null sin sueldo", () => {
    const expenses = [expense("a", "casa", 2500), expense("b", "social", 5000)];
    expect(categoryIncomeShares(expenses, "2026-11", 10000)).toEqual([
      expect.objectContaining({ category: "social", incomePct: 50 }),
      expect.objectContaining({ category: "casa", incomePct: 25 }),
    ]);
    expect(
      categoryIncomeShares(expenses, "2026-11", null).every(
        (item) => item.incomePct === null,
      ),
    ).toBe(true);
  });

  it("mantiene ahorro null en meses sin sueldo", () => {
    const data = {
      ...emptyData,
      expenses: [expense("a", "casa", 2500)],
      income: { byMonth: { "2026-11": 10000 } },
    };
    const six = lastSixMonthsSavingsTotals(data, "2026-11");
    expect(six[0]?.savedCents).toBeNull();
    expect(six[5]?.savedCents).toBe(7500);
  });
});
