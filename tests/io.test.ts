import { describe, expect, it } from "vitest";
import {
  buildFileName,
  describeReplacement,
  expensesToCsv,
  mergeAppData,
  parseBackupText,
  serializeAppData,
  summarizeData,
} from "../src/io";
import type { AppData, Expense } from "../src/types";

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

function makeData(
  expenses: Expense[] = [],
  incomeByMonth: Record<string, number> = {},
): AppData {
  return { version: 1, expenses, income: { byMonth: incomeByMonth } };
}

describe("buildFileName", () => {
  it("construye el nombre con tipo, fecha y extensión", () => {
    expect(buildFileName("copia", "json", "2026-10-21")).toBe(
      "gastos-app-copia-2026-10-21.json",
    );
    expect(buildFileName("gastos", "csv", "2026-10-21")).toBe(
      "gastos-app-gastos-2026-10-21.csv",
    );
  });
});

describe("serializeAppData y parseBackupText", () => {
  it("una copia exportada se puede volver a importar sin pérdidas", () => {
    const data = makeData([makeExpense({ id: "a", note: "Café ñ €" })], {
      "2026-10": 238000,
    });
    const result = parseBackupText(serializeAppData(data));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(data);
  });

  it("rechaza texto que no es JSON", () => {
    const result = parseBackupText("esto no es json");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/JSON/);
  });

  it("rechaza JSON válido con otra estructura", () => {
    const result = parseBackupText(JSON.stringify({ hola: "mundo" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/copia de seguridad/);
  });

  it("rechaza el archivo entero si un gasto es inválido", () => {
    const data = makeData([makeExpense({ id: "a" })]);
    const tampered = JSON.parse(serializeAppData(data)) as AppData;
    tampered.expenses[0]!.amountCents = -5;
    expect(parseBackupText(JSON.stringify(tampered)).ok).toBe(false);
  });
});

describe("summarizeData", () => {
  it("cuenta y calcula el rango de fechas y el último mes", () => {
    const data = makeData(
      [
        makeExpense({ id: "a", date: "2026-10-05" }),
        makeExpense({ id: "b", date: "2026-08-20" }),
      ],
      { "2026-12": 100000, "2026-09": 100000 },
    );
    expect(summarizeData(data)).toEqual({
      expenseCount: 2,
      incomeMonthCount: 2,
      firstDate: "2026-08-20",
      lastDate: "2026-10-05",
      lastMonth: "2026-12",
    });
  });

  it("devuelve nulos si no hay datos", () => {
    expect(summarizeData(makeData())).toEqual({
      expenseCount: 0,
      incomeMonthCount: 0,
      firstDate: null,
      lastDate: null,
      lastMonth: null,
    });
  });
});

describe("mergeAppData", () => {
  const current = makeData(
    [
      makeExpense({ id: "a", amountCents: 1000, updatedAt: 5 }),
      makeExpense({ id: "b", amountCents: 1000, updatedAt: 5 }),
    ],
    { "2026-09": 100000 },
  );
  const incoming = makeData(
    [
      makeExpense({ id: "a", amountCents: 2000, updatedAt: 9 }),
      makeExpense({ id: "b", amountCents: 9999, updatedAt: 3 }),
      makeExpense({ id: "c", amountCents: 500 }),
    ],
    { "2026-09": 150000, "2026-10": 200000 },
  );

  it("añade los nuevos y se queda con la versión más reciente de cada gasto", () => {
    const { data } = mergeAppData(current, incoming);
    expect(data.expenses.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(data.expenses.find((e) => e.id === "a")?.amountCents).toBe(2000);
    expect(data.expenses.find((e) => e.id === "b")?.amountCents).toBe(1000);
  });

  it("añade los sueldos que faltan y conserva los actuales si difieren", () => {
    const { data } = mergeAppData(current, incoming);
    expect(data.income.byMonth).toEqual({ "2026-09": 100000, "2026-10": 200000 });
  });

  it("informa de lo que ha pasado", () => {
    expect(mergeAppData(current, incoming).report).toEqual({
      addedExpenses: 1,
      updatedExpenses: 1,
      unchangedExpenses: 1,
      addedIncomes: 1,
      conflictingIncomes: 1,
    });
  });

  it("un sueldo igual en ambos sitios no cuenta como conflicto", () => {
    const same = makeData([], { "2026-09": 100000 });
    expect(mergeAppData(current, same).report.conflictingIncomes).toBe(0);
  });

  it("no modifica los datos de entrada", () => {
    const currentCopy = structuredClone(current);
    const incomingCopy = structuredClone(incoming);
    mergeAppData(current, incoming);
    expect(current).toEqual(currentCopy);
    expect(incoming).toEqual(incomingCopy);
  });

  it("combinar con un documento vacío no cambia nada", () => {
    const { data, report } = mergeAppData(current, makeData());
    expect(data).toEqual(current);
    expect(report.addedExpenses).toBe(0);
  });
});

describe("describeReplacement", () => {
  it("cuenta lo que se perdería al reemplazar", () => {
    const current = makeData([makeExpense({ id: "a" }), makeExpense({ id: "b" })], {
      "2026-08": 100000,
      "2026-09": 100000,
    });
    const incoming = makeData([makeExpense({ id: "b" }), makeExpense({ id: "c" })], {
      "2026-09": 100000,
    });
    expect(describeReplacement(current, incoming)).toEqual({
      removedExpenses: 1,
      removedIncomes: 1,
    });
  });
});

describe("expensesToCsv", () => {
  const expenses = [
    makeExpense({
      id: "b",
      date: "2026-10-20",
      category: "gasolina",
      amountCents: 5000,
      note: "Repostaje",
    }),
    makeExpense({
      id: "a",
      date: "2026-10-05",
      category: "supermercado",
      amountCents: 1250,
      note: "Compra; semanal",
    }),
  ];

  function lines(csv: string): string[] {
    return csv.slice(1).split("\r\n");
  }

  it("empieza con BOM y con la cabecera", () => {
    const csv = expensesToCsv(expenses);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines(csv)[0]).toBe("Fecha;Categoría;Nota;Importe (€)");
  });

  it("ordena por fecha ascendente, usa coma decimal y entrecomilla el separador", () => {
    const rows = lines(expensesToCsv(expenses));
    expect(rows[1]).toBe('2026-10-05;Supermercado;"Compra; semanal";12,50');
    expect(rows[2]).toBe("2026-10-20;Gasolina;Repostaje;50,00");
  });

  it("termina con salto de línea", () => {
    const rows = lines(expensesToCsv(expenses));
    expect(rows[rows.length - 1]).toBe("");
  });

  it("duplica las comillas dentro de una nota", () => {
    const csv = expensesToCsv([makeExpense({ id: "a", note: 'Dijo "hola"' })]);
    expect(csv).toContain(';"Dijo ""hola"""');
  });

  it("entrecomilla las notas con saltos de línea", () => {
    const csv = expensesToCsv([makeExpense({ id: "a", note: "a\nb" })]);
    expect(csv).toContain(';"a\nb";');
  });

  it("neutraliza las notas que una hoja de cálculo leería como fórmula", () => {
    const csv = expensesToCsv([makeExpense({ id: "a", note: "=SUMA(A1)" })]);
    expect(csv).toContain(";'=SUMA(A1);");
  });

  it("sin gastos devuelve solo la cabecera", () => {
    expect(expensesToCsv([])).toBe("\uFEFFFecha;Categoría;Nota;Importe (€)\r\n");
  });
});
