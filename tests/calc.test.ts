import { describe, expect, it } from "vitest";
import {
  compareWithPreviousMonth,
  expensesOfMonth,
  filterExpenses,
  lastSixMonthsExpenseTotals,
  lastSixMonthsSavingsTotals,
  percentagesOfTotal,
  sumCents,
  totalsByCategory,
} from "../src/calc";
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

describe("expensesOfMonth y sumCents", () => {
  it("selecciona y suma los gastos del mes", () => {
    expect(expensesOfMonth(expenses, "2026-10")).toHaveLength(3);
    expect(sumCents(expensesOfMonth(expenses, "2026-10"))).toBe(3000);
    expect(sumCents([])).toBe(0);
  });
});

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

describe("percentagesOfTotal", () => {
  const sumTenths = (values: number[]): number =>
    values.reduce((sum, value) => sum + Math.round(value * 10), 0);

  it("reparte exactamente 100 % cuando hay restos", () => {
    const result = percentagesOfTotal([1, 1, 1]);
    expect(result).toEqual([33.4, 33.3, 33.3]);
    expect(sumTenths(result)).toBe(1000);
  });

  it("suma 100 % en casos con importes desiguales", () => {
    const result = percentagesOfTotal([4520, 1999, 305, 12000, 7]);
    expect(sumTenths(result)).toBe(1000);
  });

  it("devuelve 100 para un único valor", () => {
    expect(percentagesOfTotal([5000])).toEqual([100]);
  });

  it("devuelve ceros si el total es 0 o no hay valores", () => {
    expect(percentagesOfTotal([0, 0])).toEqual([0, 0]);
    expect(percentagesOfTotal([])).toEqual([]);
  });
});

describe("totalsByCategory", () => {
  it("agrupa por categoría y ordena de mayor a menor", () => {
    const data = [
      makeExpense({ id: "1", category: "casa", amountCents: 2000 }),
      makeExpense({ id: "2", category: "alquiler", amountCents: 6000 }),
      makeExpense({ id: "3", category: "casa", amountCents: 2000 }),
    ];
    const totals = totalsByCategory(data, "2026-10");
    expect(totals.map((t) => t.category)).toEqual(["alquiler", "casa"]);
    expect(totals.map((t) => t.cents)).toEqual([6000, 4000]);
    expect(totals.map((t) => t.pct)).toEqual([60, 40]);
  });

  it("omite las categorías sin gasto y los otros meses", () => {
    const totals = totalsByCategory(expenses, "2026-09");
    expect(totals).toHaveLength(1);
    expect(totals[0]?.category).toBe("supermercado");
  });

  it("desempata por el orden de las categorías", () => {
    const data = [
      makeExpense({ id: "1", category: "otros", amountCents: 1000 }),
      makeExpense({ id: "2", category: "personal", amountCents: 1000 }),
    ];
    const totals = totalsByCategory(data, "2026-10");
    expect(totals.map((t) => t.category)).toEqual(["personal", "otros"]);
  });

  it("devuelve una lista vacía en un mes sin gastos", () => {
    expect(totalsByCategory(expenses, "2026-01")).toEqual([]);
  });
});

describe("compareWithPreviousMonth", () => {
  it("calcula la diferencia y el porcentaje", () => {
    const data = [
      makeExpense({ id: "1", date: "2026-09-10", amountCents: 10000 }),
      makeExpense({ id: "2", date: "2026-10-10", amountCents: 12000 }),
    ];
    const result = compareWithPreviousMonth(data, "2026-10");
    expect(result.previousMonth).toBe("2026-09");
    expect(result.diffCents).toBe(2000);
    expect(result.diffPct).toBeCloseTo(20);
  });

  it("indica una bajada con diferencia negativa", () => {
    const data = [
      makeExpense({ id: "1", date: "2026-09-10", amountCents: 10000 }),
      makeExpense({ id: "2", date: "2026-10-10", amountCents: 7500 }),
    ];
    const result = compareWithPreviousMonth(data, "2026-10");
    expect(result.diffCents).toBe(-2500);
    expect(result.diffPct).toBeCloseTo(-25);
  });

  it("no calcula porcentaje si el mes anterior no tiene gastos", () => {
    const data = [makeExpense({ id: "1", date: "2026-10-10", amountCents: 5000 })];
    const result = compareWithPreviousMonth(data, "2026-10");
    expect(result.previousCents).toBe(0);
    expect(result.diffPct).toBeNull();
  });

  it("compara enero con diciembre del año anterior", () => {
    const data = [makeExpense({ id: "1", date: "2025-12-31", amountCents: 3000 })];
    const result = compareWithPreviousMonth(data, "2026-01");
    expect(result.previousMonth).toBe("2025-12");
    expect(result.previousCents).toBe(3000);
  });
});

describe("lastSixMonthsExpenseTotals", () => {
  it("incluye los seis meses hasta el seleccionado, incluso al cruzar de año", () => {
    const data = [
      makeExpense({ id: "1", date: "2025-08-03", amountCents: 5000 }),
      makeExpense({ id: "2", date: "2025-12-03", amountCents: 2000 }),
      makeExpense({ id: "3", date: "2026-01-03", amountCents: 3000 }),
      makeExpense({ id: "4", date: "2026-02-03", amountCents: 9000 }),
    ];

    expect(lastSixMonthsExpenseTotals(data, "2026-01")).toEqual([
      { month: "2025-08", cents: 5000 },
      { month: "2025-09", cents: 0 },
      { month: "2025-10", cents: 0 },
      { month: "2025-11", cents: 0 },
      { month: "2025-12", cents: 2000 },
      { month: "2026-01", cents: 3000 },
    ]);
  });
});

describe("lastSixMonthsSavingsTotals", () => {
  it("calcula ahorro, déficit y meses sin sueldo registrado", () => {
    const data = {
      version: 1 as const,
      expenses: [
        makeExpense({ id: "aug", date: "2025-08-03", amountCents: 5000 }),
        makeExpense({ id: "dec", date: "2025-12-03", amountCents: 2000 }),
        makeExpense({ id: "jan", date: "2026-01-03", amountCents: 1000 }),
      ],
      income: { byMonth: { "2025-08": 12000, "2025-12": 1000, "2026-01": 3000 } },
    };

    expect(lastSixMonthsSavingsTotals(data, "2026-01")).toEqual([
      { month: "2025-08", spentCents: 5000, savedCents: 7000 },
      { month: "2025-09", spentCents: 0, savedCents: null },
      { month: "2025-10", spentCents: 0, savedCents: null },
      { month: "2025-11", spentCents: 0, savedCents: null },
      { month: "2025-12", spentCents: 2000, savedCents: -1000 },
      { month: "2026-01", spentCents: 1000, savedCents: 2000 },
    ]);
  });
});
