import { isCategoryKey } from "../config";
import type { CategoryKey, Expense, IsoDate } from "../types";
import { validateAmount, validateExpenseInput } from "../validate";

export interface ExpenseDocument {
  amountCents: number;
  category: CategoryKey;
  date: IsoDate;
  note: string;
  walletId?: string;
  recurringId?: string;
  recurringMonth?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MonthlyIncomeDocument {
  amountCents: number;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** El id no se guarda como campo: es el ID del documento. */
export function expenseToDocument(expense: Expense): ExpenseDocument {
  return {
    amountCents: expense.amountCents,
    category: expense.category,
    date: expense.date,
    note: expense.note,
    ...(expense.walletId ? { walletId: expense.walletId } : {}),
    ...(expense.recurringId ? { recurringId: expense.recurringId } : {}),
    ...(expense.recurringMonth ? { recurringMonth: expense.recurringMonth } : {}),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

export function incomeToDocument(
  amountCents: number,
  updatedAt: number,
): MonthlyIncomeDocument {
  return { amountCents, updatedAt };
}

/** Devuelve null si el documento no tiene la forma esperada. */
export function documentToExpense(id: string, raw: unknown): Expense | null {
  if (!isRecord(raw)) return null;
  const { amountCents, category, date, note, createdAt, updatedAt, walletId } = raw;

  if (typeof amountCents !== "number") return null;
  if (!isCategoryKey(category)) return null;
  if (typeof date !== "string" || typeof note !== "string") return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  if (walletId !== undefined && walletId !== null && typeof walletId !== "string")
    return null;
  if (
    raw["recurringId"] !== undefined &&
    (typeof raw["recurringId"] !== "string" || !raw["recurringId"])
  )
    return null;
  if (
    raw["recurringMonth"] !== undefined &&
    (typeof raw["recurringMonth"] !== "string" ||
      !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(raw["recurringMonth"]))
  )
    return null;

  const checked = validateExpenseInput({
    amountCents,
    category,
    date,
    note,
    ...(typeof walletId === "string" ? { walletId } : {}),
  });
  if (!checked.ok) return null;

  return {
    id,
    ...checked.value,
    ...(typeof raw["recurringId"] === "string"
      ? { recurringId: raw["recurringId"] }
      : {}),
    ...(typeof raw["recurringMonth"] === "string"
      ? { recurringMonth: raw["recurringMonth"] }
      : {}),
    createdAt,
    updatedAt,
  };
}

/** Devuelve el sueldo en céntimos, o null si el documento no es válido. */
export function documentToMonthlyIncome(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const { amountCents } = raw;
  if (typeof amountCents !== "number") return null;
  const checked = validateAmount(amountCents);
  return checked.ok ? checked.value : null;
}
