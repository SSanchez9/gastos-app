import { describe, expect, it } from "vitest";
import { filterExpenses } from "../src/calc";
import type { Expense } from "../src/types";

function makeExpense(overrides: Partial<Expense> & Pick<Expense, "id">): Expense {
  return {
    amountCents: 1000,
    category: "otros",
    date: "2026-10-15",
    note: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const expenses: Expense[] = [
  makeExpense({ id: "a", date: "2026-10-05", category: "supermercado" }),
  makeExpense({ id: "b", date: "2026-10-20", category: "gasolina" }),
  makeExpense({ id: "c", date: "2026-09-30", category: "supermercado" }),
  makeExpense({ id: "d", date: "2026-10-20", category: "casa", createdAt: 5 }),
];

describe("filterExpenses", () => {
  it("devuelve solo los gastos del mes", () => {
    const ids = filterExpenses(expenses, "2026-10", "all").map((e) => e.id);
    expect(ids).not.toContain("c");
    expect(ids).toHaveLength(3);
  });

  it("filtra por categoría", () => {
    const ids = filterExpenses(expenses, "2026-10", "supermercado").map((e) => e.id);
    expect(ids).toEqual(["a"]);
  });

  it("ordena por fecha descendente y, a igual fecha, por creación", () => {
    const ids = filterExpenses(expenses, "2026-10", "all").map((e) => e.id);
    expect(ids).toEqual(["d", "b", "a"]);
  });

  it("devuelve una lista vacía si no hay gastos", () => {
    expect(filterExpenses(expenses, "2026-01", "all")).toEqual([]);
  });

  it("no modifica el array original", () => {
    const copy = [...expenses];
    filterExpenses(expenses, "2026-10", "all");
    expect(expenses).toEqual(copy);
  });
});
