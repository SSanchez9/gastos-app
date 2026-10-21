import { describe, expect, it } from "vitest";
import { parseAppData, validateExpenseInput } from "../src/validate";

const validData = {
  version: 1,
  expenses: [
    {
      id: "a1",
      amountCents: 1250,
      category: "supermercado",
      date: "2026-10-19",
      note: "Compra semanal",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  income: { byMonth: { "2026-10": 238000 } },
};

function clone(): typeof validData {
  return structuredClone(validData);
}

describe("parseAppData", () => {
  it("acepta un documento válido", () => {
    expect(parseAppData(validData)).toEqual(validData);
  });

  it("acepta un documento sin gastos ni sueldos", () => {
    expect(
      parseAppData({ version: 1, expenses: [], income: { byMonth: {} } }),
    ).not.toBeNull();
  });

  it.each([null, "texto", 42, [], {}])("rechaza %j", (raw) => {
    expect(parseAppData(raw)).toBeNull();
  });

  it("rechaza otra versión", () => {
    expect(parseAppData({ ...validData, version: 2 })).toBeNull();
  });

  it("rechaza importes no positivos o con decimales", () => {
    const negative = clone();
    negative.expenses[0]!.amountCents = -5;
    expect(parseAppData(negative)).toBeNull();

    const decimal = clone();
    decimal.expenses[0]!.amountCents = 12.5;
    expect(parseAppData(decimal)).toBeNull();
  });

  it("rechaza categorías y fechas inválidas", () => {
    const category = clone();
    (category.expenses[0] as { category: string }).category = "inventada";
    expect(parseAppData(category)).toBeNull();

    const oldCategory = clone();
    (oldCategory.expenses[0] as { category: string }).category = "comida";
    expect(parseAppData(oldCategory)).toBeNull();

    const date = clone();
    date.expenses[0]!.date = "2026-02-30";
    expect(parseAppData(date)).toBeNull();
  });

  it("rechaza ids duplicados", () => {
    const data = clone();
    data.expenses.push({ ...data.expenses[0]! });
    expect(parseAppData(data)).toBeNull();
  });

  it("rechaza meses inválidos en el sueldo", () => {
    const data = clone();
    (data.income.byMonth as Record<string, number>)["octubre"] = 1000;
    expect(parseAppData(data)).toBeNull();
  });
});

describe("validateExpenseInput", () => {
  const input = {
    amountCents: 1250,
    category: "supermercado" as const,
    date: "2026-10-19",
    note: "  Compra  ",
  };

  it("recorta la nota", () => {
    const result = validateExpenseInput(input);
    expect(result.ok && result.value.note).toBe("Compra");
  });

  it("rechaza importe cero", () => {
    expect(validateExpenseInput({ ...input, amountCents: 0 }).ok).toBe(false);
  });

  it("rechaza fecha inválida", () => {
    expect(validateExpenseInput({ ...input, date: "ayer" }).ok).toBe(false);
  });

  it("rechaza notas demasiado largas", () => {
    expect(validateExpenseInput({ ...input, note: "x".repeat(121) }).ok).toBe(false);
  });
});
