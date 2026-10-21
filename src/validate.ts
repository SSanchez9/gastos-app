import { DATA_VERSION, NOTE_MAX_LENGTH, isCategoryKey } from "./config";
import { isValidIsoDate, isValidMonthKey } from "./format";
import type { AppData, Expense, NewExpense, Result } from "./types";

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Importe en céntimos: entero positivo. */
export function validateAmount(cents: number): Result<number> {
  if (!isPositiveInt(cents)) return fail("El importe debe ser mayor que 0.");
  return { ok: true, value: cents };
}

/** Valida y normaliza (recorta la nota) los datos de un gasto. */
export function validateExpenseInput(input: NewExpense): Result<NewExpense> {
  if (!isPositiveInt(input.amountCents)) return fail("El importe debe ser mayor que 0.");
  if (!isCategoryKey(input.category)) return fail("La categoría no es válida.");
  if (!isValidIsoDate(input.date)) return fail("La fecha no es válida.");

  const note = input.note.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    return fail(`La nota no puede superar los ${NOTE_MAX_LENGTH} caracteres.`);
  }

  return {
    ok: true,
    value: {
      amountCents: input.amountCents,
      category: input.category,
      date: input.date,
      note,
    },
  };
}

function parseExpense(raw: unknown): Expense | null {
  if (!isRecord(raw)) return null;
  const { id, amountCents, category, date, note, createdAt, updatedAt } = raw;

  if (typeof id !== "string" || id === "") return null;
  if (!isPositiveInt(amountCents)) return null;
  if (!isCategoryKey(category)) return null;
  if (typeof date !== "string" || !isValidIsoDate(date)) return null;
  if (typeof note !== "string" || note.length > NOTE_MAX_LENGTH) return null;
  if (!isFiniteNumber(createdAt) || !isFiniteNumber(updatedAt)) return null;

  return { id, amountCents, category, date, note, createdAt, updatedAt };
}

function parseMonthMap(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const result: Record<string, number> = {};
  for (const [month, cents] of Object.entries(raw)) {
    if (!isValidMonthKey(month) || !isPositiveInt(cents)) return null;
    result[month] = cents;
  }
  return result;
}

/**
 * Valida un documento completo (de localStorage o de un JSON importado).
 * Devuelve null si algo no cumple: no se acepta un documento a medias.
 */
export function parseAppData(raw: unknown): AppData | null {
  if (!isRecord(raw)) return null;
  const { version, expenses, income } = raw;

  if (version !== DATA_VERSION) return null;
  if (!Array.isArray(expenses) || !isRecord(income)) return null;

  const parsedExpenses: Expense[] = [];
  const ids = new Set<string>();
  for (const item of expenses as unknown[]) {
    const expense = parseExpense(item);
    if (expense === null || ids.has(expense.id)) return null;
    ids.add(expense.id);
    parsedExpenses.push(expense);
  }

  const parsedIncomeByMonth = parseMonthMap(income["byMonth"]);
  if (parsedIncomeByMonth === null) return null;

  return {
    version: DATA_VERSION,
    expenses: parsedExpenses,
    income: { byMonth: parsedIncomeByMonth },
  };
}
