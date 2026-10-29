import type { AppData, Expense, MonthKey } from "../types";

export interface DataChanges {
  expensesToSet: Expense[];
  expenseIdsToDelete: string[];
  incomesToSet: { month: MonthKey; cents: number }[];
  incomeMonthsToDelete: MonthKey[];
}

function sameExpense(a: Expense, b: Expense): boolean {
  return (
    a.amountCents === b.amountCents &&
    a.category === b.category &&
    a.date === b.date &&
    a.note === b.note &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  );
}

/** Cambios necesarios para pasar de `current` a `next`. No modifica ninguno de los dos. */
export function diffAppData(current: AppData, next: AppData): DataChanges {
  const currentById = new Map(
    current.expenses.map((expense) => [expense.id, expense] as const),
  );
  const nextIds = new Set(next.expenses.map((expense) => expense.id));

  const expensesToSet = next.expenses.filter((expense) => {
    const existing = currentById.get(expense.id);
    return existing === undefined || !sameExpense(existing, expense);
  });

  const expenseIdsToDelete = current.expenses
    .filter((expense) => !nextIds.has(expense.id))
    .map((expense) => expense.id);

  const incomesToSet = Object.entries(next.income.byMonth)
    .filter(([month, cents]) => current.income.byMonth[month] !== cents)
    .map(([month, cents]) => ({ month, cents }));

  const incomeMonthsToDelete = Object.keys(current.income.byMonth).filter(
    (month) => next.income.byMonth[month] === undefined,
  );

  return { expensesToSet, expenseIdsToDelete, incomesToSet, incomeMonthsToDelete };
}
