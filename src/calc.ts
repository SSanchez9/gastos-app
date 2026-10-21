import { CATEGORY_KEYS } from "./config";
import { getMonthKey, shiftMonth } from "./format";
import type {
  AppData,
  CategoryFilter,
  CategoryKey,
  Expense,
  Income,
  MonthKey,
} from "./types";

/** Gastos de un mes, en el orden original. */
export function expensesOfMonth(
  expenses: readonly Expense[],
  month: MonthKey,
): Expense[] {
  return expenses.filter((expense) => getMonthKey(expense.date) === month);
}

/** Suma de importes en céntimos. */
export function sumCents(expenses: readonly Expense[]): number {
  return expenses.reduce((total, expense) => total + expense.amountCents, 0);
}

/**
 * Gastos de un mes (y opcionalmente de una categoría), del más reciente al más antiguo.
 * Devuelve un array nuevo: no modifica el original.
 */
export function filterExpenses(
  expenses: readonly Expense[],
  month: MonthKey,
  filter: CategoryFilter,
): Expense[] {
  return expensesOfMonth(expenses, month)
    .filter((expense) => filter === "all" || expense.category === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/**
 * Reparte 100 % entre valores no negativos con un decimal, de forma que la suma
 * sea exactamente 100,0 (método del mayor resto). Si el total es 0, todo es 0.
 */
export function percentagesOfTotal(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  // Trabajamos en décimas de porcentaje (total = 1000) con enteros, sin decimales flotantes.
  const scaled = values.map((value, index) => {
    const numerator = value * 1000;
    const remainder = numerator % total;
    return { index, floor: (numerator - remainder) / total, remainder };
  });

  const result = scaled.map((item) => item.floor);
  let missing = 1000 - result.reduce((sum, tenths) => sum + tenths, 0);

  const byRemainder = [...scaled].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  for (const item of byRemainder) {
    if (missing <= 0) break;
    result[item.index] = (result[item.index] ?? 0) + 1;
    missing -= 1;
  }

  return result.map((tenths) => tenths / 10);
}

export interface CategoryTotal {
  category: CategoryKey;
  cents: number;
  /** Porcentaje sobre el total gastado del mes (un decimal). */
  pct: number;
}

/** Total por categoría del mes, de mayor a menor. Solo categorías con gasto. */
export function totalsByCategory(
  expenses: readonly Expense[],
  month: MonthKey,
): CategoryTotal[] {
  const totals = new Map<CategoryKey, number>();
  for (const expense of expensesOfMonth(expenses, month)) {
    totals.set(
      expense.category,
      (totals.get(expense.category) ?? 0) + expense.amountCents,
    );
  }

  const entries = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || CATEGORY_KEYS.indexOf(a[0]) - CATEGORY_KEYS.indexOf(b[0]),
  );
  const percentages = percentagesOfTotal(entries.map(([, cents]) => cents));

  return entries.map(([category, cents], index) => ({
    category,
    cents,
    pct: percentages[index] ?? 0,
  }));
}

export interface MonthComparison {
  previousMonth: MonthKey;
  currentCents: number;
  previousCents: number;
  /** Positivo si se gasta más que el mes anterior. */
  diffCents: number;
  /** Variación porcentual; null si el mes anterior no tiene gastos. */
  diffPct: number | null;
}

export function compareWithPreviousMonth(
  expenses: readonly Expense[],
  month: MonthKey,
): MonthComparison {
  const previousMonth = shiftMonth(month, -1);
  const currentCents = sumCents(expensesOfMonth(expenses, month));
  const previousCents = sumCents(expensesOfMonth(expenses, previousMonth));
  const diffCents = currentCents - previousCents;

  return {
    previousMonth,
    currentCents,
    previousCents,
    diffCents,
    diffPct: previousCents > 0 ? (diffCents / previousCents) * 100 : null,
  };
}

export interface PreviousIncome {
  month: MonthKey;
  cents: number;
}

/**
 * Sueldo registrado más reciente de un mes anterior al indicado (aunque haya huecos).
 * Devuelve null si no hay ninguno.
 */
export function getPreviousIncome(
  income: Income,
  month: MonthKey,
): PreviousIncome | null {
  let best: PreviousIncome | null = null;
  for (const [key, cents] of Object.entries(income.byMonth)) {
    // Las claves "YYYY-MM" se ordenan correctamente como texto.
    if (key < month && (best === null || key > best.month)) {
      best = { month: key, cents };
    }
  }
  return best;
}

export interface SavingsSummary {
  /** null si el mes no tiene sueldo registrado. */
  incomeCents: number | null;
  spentCents: number;
  /** null si no hay sueldo; negativo si hay déficit. */
  savedCents: number | null;
  /** Porcentaje sobre el sueldo; null si no hay sueldo. */
  savingsPct: number | null;
  isDeficit: boolean;
}

export function getSavingsSummary(data: AppData, month: MonthKey): SavingsSummary {
  const spentCents = sumCents(expensesOfMonth(data.expenses, month));
  const incomeCents = data.income.byMonth[month] ?? null;

  if (incomeCents === null) {
    return {
      incomeCents: null,
      spentCents,
      savedCents: null,
      savingsPct: null,
      isDeficit: false,
    };
  }

  const savedCents = incomeCents - spentCents;
  return {
    incomeCents,
    spentCents,
    savedCents,
    savingsPct: (savedCents / incomeCents) * 100,
    isDeficit: savedCents < 0,
  };
}
