import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { Unsubscribe, WriteBatch } from "firebase/firestore";
import { isValidMonthKey } from "../format";
import type { AppData, CategoryKey, Expense, Income, MonthKey, Result } from "../types";
import { getFirebaseDb } from "./client";
import { parseAppData } from "../validate";
import { diffAppData } from "./diff";
import { describeFirestoreError } from "./firestore-errors";
import {
  documentToExpense,
  documentToMonthlyIncome,
  expenseToDocument,
  incomeToDocument,
} from "./mappers";
import { expensesPath, financeSettingsPath, monthlyIncomesPath } from "./paths";

/** Límite de operaciones por lote en Firestore. */
const MAX_BATCH_OPERATIONS = 500;

async function attempt(operation: () => Promise<void>): Promise<Result<null>> {
  try {
    await operation();
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: describeFirestoreError(error) };
  }
}

// ---------- Lectura en vivo ----------

/** Escucha todos los gastos del usuario. Devuelve la función para dejar de escuchar. */
export function watchExpenses(
  userId: string,
  onData: (expenses: Expense[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), expensesPath(userId)),
    (snapshot) => {
      const expenses: Expense[] = [];
      for (const document of snapshot.docs) {
        const expense = documentToExpense(document.id, document.data());
        if (expense === null) {
          console.warn(`Gasto ignorado por tener un formato no válido: ${document.id}`);
          continue;
        }
        expenses.push(expense);
      }
      onData(expenses);
    },
    (error) => onError(describeFirestoreError(error)),
  );
}

/** Escucha los sueldos de todos los meses. Devuelve la función para dejar de escuchar. */
export function watchMonthlyIncomes(
  userId: string,
  onData: (income: Income) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), monthlyIncomesPath(userId)),
    (snapshot) => {
      const byMonth: Record<MonthKey, number> = {};
      for (const document of snapshot.docs) {
        const cents = documentToMonthlyIncome(document.data());
        if (!isValidMonthKey(document.id) || cents === null) {
          console.warn(`Sueldo ignorado por tener un formato no válido: ${document.id}`);
          continue;
        }
        byMonth[document.id] = cents;
      }
      onData({ byMonth });
    },
    (error) => onError(describeFirestoreError(error)),
  );
}

export function watchFinanceSettings(
  userId: string,
  onData: (
    settings: Pick<
      AppData,
      | "budgets"
      | "goals"
      | "recurring"
      | "wallets"
      | "transfers"
      | "incomeEntries"
      | "migratedIncomeMonths"
      | "categories"
    >,
  ) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), financeSettingsPath(userId)),
    (snapshot) => {
      const raw = snapshot.exists() ? snapshot.data() : {};
      const parsed = parseAppData({
        version: 1,
        expenses: [],
        income: { byMonth: {} },
        ...raw,
      });
      onData({
        budgets: parsed?.budgets ?? {},
        goals: parsed?.goals ?? [],
        recurring: parsed?.recurring ?? [],
        wallets: parsed?.wallets ?? [],
        transfers: parsed?.transfers ?? [],
        incomeEntries: parsed?.incomeEntries ?? [],
        migratedIncomeMonths: parsed?.migratedIncomeMonths ?? [],
        // Sin lista guardada se deja sin definir: la app calcula la lista (categories.ts).
        categories: parsed?.categories,
      });
    },
    (error) => onError(describeFirestoreError(error)),
  );
}

export function saveFinanceSettings(
  userId: string,
  settings: Pick<
    AppData,
    | "budgets"
    | "goals"
    | "recurring"
    | "wallets"
    | "transfers"
    | "incomeEntries"
    | "migratedIncomeMonths"
    | "categories"
  >,
): Promise<Result<null>> {
  // Firestore no admite campos undefined: la lista de categorías solo se escribe si existe.
  const { categories, ...rest } = settings;
  return attempt(() =>
    setDoc(
      doc(getFirebaseDb(), financeSettingsPath(userId)),
      categories === undefined ? rest : { ...rest, categories },
      { merge: true },
    ),
  );
}

// ---------- Gastos ----------

export function createExpense(userId: string, expense: Expense): Promise<Result<null>> {
  return attempt(() =>
    setDoc(
      doc(getFirebaseDb(), expensesPath(userId), expense.id),
      expenseToDocument(expense),
    ),
  );
}

/** Actualiza los campos editables; createdAt no se toca. */
export function updateExpense(userId: string, expense: Expense): Promise<Result<null>> {
  return attempt(() =>
    updateDoc(doc(getFirebaseDb(), expensesPath(userId), expense.id), {
      amountCents: expense.amountCents,
      category: expense.category,
      date: expense.date,
      note: expense.note,
      walletId: expense.walletId ?? deleteField(),
      updatedAt: expense.updatedAt,
    }),
  );
}

/**
 * Cambia la categoría de varios gastos (al borrar una categoría). Va por lotes de 500;
 * si falla a medias, repetir la operación termina el trabajo sin duplicar nada.
 */
export function moveExpensesToCategory(
  userId: string,
  expenseIds: readonly string[],
  category: CategoryKey,
): Promise<Result<null>> {
  const db = getFirebaseDb();
  const updatedAt = Date.now();
  return attempt(async () => {
    for (let start = 0; start < expenseIds.length; start += MAX_BATCH_OPERATIONS) {
      const batch = writeBatch(db);
      for (const id of expenseIds.slice(start, start + MAX_BATCH_OPERATIONS)) {
        batch.update(doc(db, expensesPath(userId), id), { category, updatedAt });
      }
      await batch.commit();
    }
  });
}

export function deleteExpense(userId: string, expenseId: string): Promise<Result<null>> {
  return attempt(() => deleteDoc(doc(getFirebaseDb(), expensesPath(userId), expenseId)));
}

// ---------- Sueldos ----------

export function saveMonthlyIncome(
  userId: string,
  month: MonthKey,
  amountCents: number,
): Promise<Result<null>> {
  return attempt(() =>
    setDoc(
      doc(getFirebaseDb(), monthlyIncomesPath(userId), month),
      incomeToDocument(amountCents, Date.now()),
    ),
  );
}

export function deleteMonthlyIncome(
  userId: string,
  month: MonthKey,
): Promise<Result<null>> {
  return attempt(() =>
    deleteDoc(doc(getFirebaseDb(), monthlyIncomesPath(userId), month)),
  );
}

// ---------- Importación ----------

/**
 * Deja la nube igual que `next`, escribiendo y borrando solo lo que cambia.
 * Los lotes de más de 500 operaciones se envían por partes (no son atómicos entre sí).
 */
export function replaceAppData(
  userId: string,
  current: AppData,
  next: AppData,
): Promise<Result<null>> {
  const db = getFirebaseDb();
  const changes = diffAppData(current, next);
  const now = Date.now();
  const operations: ((batch: WriteBatch) => void)[] = [];

  for (const expense of changes.expensesToSet) {
    operations.push((batch) => {
      batch.set(doc(db, expensesPath(userId), expense.id), expenseToDocument(expense));
    });
  }
  for (const id of changes.expenseIdsToDelete) {
    operations.push((batch) => {
      batch.delete(doc(db, expensesPath(userId), id));
    });
  }
  for (const income of changes.incomesToSet) {
    operations.push((batch) => {
      batch.set(
        doc(db, monthlyIncomesPath(userId), income.month),
        incomeToDocument(income.cents, now),
      );
    });
  }
  for (const month of changes.incomeMonthsToDelete) {
    operations.push((batch) => {
      batch.delete(doc(db, monthlyIncomesPath(userId), month));
    });
  }
  operations.push((batch) => {
    batch.set(
      doc(db, financeSettingsPath(userId)),
      {
        budgets: next.budgets ?? {},
        goals: next.goals ?? [],
        recurring: next.recurring ?? [],
        wallets: next.wallets ?? [],
        transfers: next.transfers ?? [],
        incomeEntries: next.incomeEntries ?? [],
        migratedIncomeMonths: next.migratedIncomeMonths ?? [],
        // Una copia sin categorías deja la lista calculada, como en los datos antiguos.
        categories: next.categories ?? deleteField(),
      },
      { merge: true },
    );
  });

  return attempt(async () => {
    for (let start = 0; start < operations.length; start += MAX_BATCH_OPERATIONS) {
      const batch = writeBatch(db);
      for (const operation of operations.slice(start, start + MAX_BATCH_OPERATIONS)) {
        operation(batch);
      }
      await batch.commit();
    }
  });
}
