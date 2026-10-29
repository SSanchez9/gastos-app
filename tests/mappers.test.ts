import { describe, expect, it } from "vitest";
import {
  documentToExpense,
  documentToMonthlyIncome,
  expenseToDocument,
  incomeToDocument,
} from "../src/firebase/mappers";
import type { Expense } from "../src/types";

const expense: Expense = {
  id: "a1",
  amountCents: 1250,
  category: "supermercado",
  date: "2026-10-19",
  note: "Compra",
  createdAt: 1,
  updatedAt: 2,
};

describe("expenseToDocument", () => {
  it("no incluye el id, que es el ID del documento", () => {
    expect(expenseToDocument(expense)).toEqual({
      amountCents: 1250,
      category: "supermercado",
      date: "2026-10-19",
      note: "Compra",
      createdAt: 1,
      updatedAt: 2,
    });
  });
});

describe("documentToExpense", () => {
  it("reconstruye el gasto con su id", () => {
    expect(documentToExpense("a1", expenseToDocument(expense))).toEqual(expense);
  });

  it.each([
    ["null", null],
    ["texto", "hola"],
    ["array", []],
    ["importe negativo", { ...expenseToDocument(expense), amountCents: -5 }],
    ["importe decimal", { ...expenseToDocument(expense), amountCents: 12.5 }],
    ["categoría inventada", { ...expenseToDocument(expense), category: "comida" }],
    ["fecha imposible", { ...expenseToDocument(expense), date: "2026-02-30" }],
    ["nota demasiado larga", { ...expenseToDocument(expense), note: "x".repeat(121) }],
    ["createdAt de tipo texto", { ...expenseToDocument(expense), createdAt: "ayer" }],
    [
      "falta updatedAt",
      { amountCents: 1250, category: "otros", date: "2026-10-19", note: "" },
    ],
  ])("rechaza un documento con %s", (_label, raw) => {
    expect(documentToExpense("a1", raw)).toBeNull();
  });
});

describe("documentToMonthlyIncome", () => {
  it("lee el importe de un documento válido", () => {
    expect(documentToMonthlyIncome(incomeToDocument(238000, 5))).toBe(238000);
  });

  it.each([
    null,
    "texto",
    {},
    { amountCents: 0 },
    { amountCents: -1 },
    { amountCents: "10" },
  ])("rechaza %j", (raw) => {
    expect(documentToMonthlyIncome(raw)).toBeNull();
  });
});
