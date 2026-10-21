import { getMonthKey } from "./format";
import type { CategoryFilter, Expense, MonthKey } from "./types";

/**
 * Gastos de un mes (y opcionalmente de una categoría), del más reciente al más antiguo.
 * Devuelve un array nuevo: no modifica el original.
 */
export function filterExpenses(
  expenses: readonly Expense[],
  month: MonthKey,
  filter: CategoryFilter,
): Expense[] {
  return expenses
    .filter(
      (expense) =>
        getMonthKey(expense.date) === month &&
        (filter === "all" || expense.category === filter),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
