export const COLLECTION_USERS = "users";
export const COLLECTION_EXPENSES = "expenses";
export const COLLECTION_MONTHLY_INCOMES = "monthlyIncomes";

/** users/{userId}/expenses */
export function expensesPath(userId: string): string {
  return `${COLLECTION_USERS}/${userId}/${COLLECTION_EXPENSES}`;
}

/** users/{userId}/monthlyIncomes */
export function monthlyIncomesPath(userId: string): string {
  return `${COLLECTION_USERS}/${userId}/${COLLECTION_MONTHLY_INCOMES}`;
}
