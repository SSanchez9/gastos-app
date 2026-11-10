import { DATA_VERSION, NOTE_MAX_LENGTH, isCategoryKey } from "./config";
import { isValidIsoDate, isValidMonthKey } from "./format";
import type {
  AppData,
  Expense,
  NewExpense,
  RecurringExpense,
  SavingsGoal,
  Wallet,
  WalletTransfer,
  WalletKind,
  Result,
  GoalContribution,
  IncomeEntry,
} from "./types";

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
      ...(input.walletId === undefined ? {} : { walletId: input.walletId }),
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

  if (raw["walletId"] !== undefined && typeof raw["walletId"] !== "string") return null;
  if (
    raw["recurringId"] !== undefined &&
    (typeof raw["recurringId"] !== "string" || !raw["recurringId"])
  )
    return null;
  if (
    raw["recurringMonth"] !== undefined &&
    (typeof raw["recurringMonth"] !== "string" || !isValidMonthKey(raw["recurringMonth"]))
  )
    return null;
  return {
    id,
    amountCents,
    category,
    date,
    note,
    ...(typeof raw["walletId"] === "string" ? { walletId: raw["walletId"] } : {}),
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

  const result: AppData = {
    version: DATA_VERSION,
    expenses: parsedExpenses,
    income: { byMonth: parsedIncomeByMonth },
  };
  if (raw["budgets"] !== undefined) {
    const budgets = parseMonthMap(raw["budgets"]);
    if (budgets === null) return null;
    result.budgets = budgets;
  }
  if (raw["incomeEntries"] !== undefined) {
    if (!Array.isArray(raw["incomeEntries"])) return null;
    const entries = raw["incomeEntries"].map(parseIncomeEntry);
    if (entries.some((entry) => entry === null)) return null;
    const parsedEntries = entries as IncomeEntry[];
    if (new Set(parsedEntries.map((entry) => entry.id)).size !== parsedEntries.length)
      return null;
    result.incomeEntries = parsedEntries;
  }
  if (raw["migratedIncomeMonths"] !== undefined) {
    if (
      !Array.isArray(raw["migratedIncomeMonths"]) ||
      !raw["migratedIncomeMonths"].every(
        (month) => typeof month === "string" && isValidMonthKey(month),
      )
    )
      return null;
    result.migratedIncomeMonths = [...new Set(raw["migratedIncomeMonths"] as string[])];
  }
  if (raw["goals"] !== undefined) {
    if (!Array.isArray(raw["goals"])) return null;
    const goals = raw["goals"].map(parseGoal);
    if (goals.some((goal) => goal === null)) return null;
    result.goals = goals as SavingsGoal[];
  }
  if (raw["recurring"] !== undefined) {
    if (!Array.isArray(raw["recurring"])) return null;
    const recurring = raw["recurring"].map(parseRecurring);
    if (recurring.some((item) => item === null)) return null;
    result.recurring = recurring as RecurringExpense[];
  }
  if (raw["wallets"] !== undefined) {
    if (!Array.isArray(raw["wallets"])) return null;
    const wallets = raw["wallets"].map(parseWallet);
    if (wallets.some((wallet) => wallet === null)) return null;
    const parsedWallets = wallets as Wallet[];
    if (new Set(parsedWallets.map((wallet) => wallet.id)).size !== parsedWallets.length)
      return null;
    result.wallets = parsedWallets;
    const walletIds = new Set(parsedWallets.map((wallet) => wallet.id));
    if (
      parsedExpenses.some(
        (expense) => expense.walletId !== undefined && !walletIds.has(expense.walletId),
      )
    )
      return null;
  }
  if (raw["transfers"] !== undefined) {
    if (!Array.isArray(raw["transfers"])) return null;
    const transfers = raw["transfers"].map(parseTransfer);
    if (transfers.some((transfer) => transfer === null)) return null;
    result.transfers = transfers as WalletTransfer[];
    if (
      !result.wallets ||
      result.transfers.some(
        (transfer) =>
          !result.wallets?.some((wallet) => wallet.id === transfer.fromWalletId) ||
          !result.wallets?.some((wallet) => wallet.id === transfer.toWalletId),
      )
    )
      return null;
  }
  if (
    parsedExpenses.some(
      (expense) =>
        expense.walletId !== undefined &&
        !result.wallets?.some((wallet) => wallet.id === expense.walletId),
    )
  )
    return null;
  return result;
}

function parseWallet(raw: unknown): Wallet | null {
  if (!isRecord(raw)) return null;
  const { id, name, kind, openingCents, createdAt } = raw;
  const kinds: WalletKind[] = ["bank", "cash", "card", "savings", "investment"];
  if (
    typeof id !== "string" ||
    !id ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 60 ||
    !kinds.includes(kind as WalletKind)
  )
    return null;
  if (
    !Number.isSafeInteger(openingCents) ||
    (openingCents as number) < 0 ||
    !isFiniteNumber(createdAt)
  )
    return null;
  return {
    id,
    name: name.trim(),
    kind: kind as WalletKind,
    openingCents: openingCents as number,
    createdAt,
  };
}

function parseTransfer(raw: unknown): WalletTransfer | null {
  if (!isRecord(raw)) return null;
  const { id, fromWalletId, toWalletId, amountCents, date, note, createdAt } = raw;
  if (
    typeof id !== "string" ||
    !id ||
    typeof fromWalletId !== "string" ||
    typeof toWalletId !== "string" ||
    fromWalletId === toWalletId
  )
    return null;
  if (
    !isPositiveInt(amountCents) ||
    typeof date !== "string" ||
    !isValidIsoDate(date) ||
    typeof note !== "string" ||
    note.length > NOTE_MAX_LENGTH ||
    !isFiniteNumber(createdAt)
  )
    return null;
  return { id, fromWalletId, toWalletId, amountCents, date, note, createdAt };
}

function parseGoal(raw: unknown): SavingsGoal | null {
  if (!isRecord(raw)) return null;
  const { id, name, targetCents, savedCents, dueDate, createdAt } = raw;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > 60
  )
    return null;
  if (
    !isPositiveInt(targetCents) ||
    !Number.isSafeInteger(savedCents) ||
    (savedCents as number) < 0
  )
    return null;
  if (dueDate !== null && (typeof dueDate !== "string" || !isValidIsoDate(dueDate)))
    return null;
  if (!isFiniteNumber(createdAt)) return null;
  let contributions: GoalContribution[] | undefined;
  if (raw["contributions"] !== undefined) {
    if (!Array.isArray(raw["contributions"])) return null;
    const parsed = raw["contributions"].map(parseGoalContribution);
    if (parsed.some((item) => item === null)) return null;
    contributions = parsed as GoalContribution[];
    if (new Set(contributions.map((item) => item.id)).size !== contributions.length)
      return null;
  }
  return {
    id,
    name: name.trim(),
    targetCents,
    savedCents: savedCents as number,
    dueDate: dueDate as string | null,
    createdAt,
    ...(contributions === undefined ? {} : { contributions }),
  };
}

function parseGoalContribution(raw: unknown): GoalContribution | null {
  if (!isRecord(raw)) return null;
  const { id, amountCents, date, createdAt } = raw;
  if (
    typeof id !== "string" ||
    !id ||
    !isPositiveInt(amountCents) ||
    typeof date !== "string" ||
    !isValidIsoDate(date) ||
    !isFiniteNumber(createdAt)
  )
    return null;
  return { id, amountCents, date, createdAt };
}

function parseIncomeEntry(raw: unknown): IncomeEntry | null {
  if (!isRecord(raw)) return null;
  const { id, title, amountCents, date, createdAt, updatedAt, legacySourceMonth } = raw;
  if (
    typeof id !== "string" ||
    !id ||
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 80 ||
    !isPositiveInt(amountCents) ||
    typeof date !== "string" ||
    !isValidIsoDate(date) ||
    !isFiniteNumber(createdAt) ||
    !isFiniteNumber(updatedAt)
  )
    return null;
  if (
    legacySourceMonth !== undefined &&
    (typeof legacySourceMonth !== "string" || !isValidMonthKey(legacySourceMonth))
  )
    return null;
  return {
    id,
    title: title.trim(),
    amountCents,
    date,
    createdAt,
    updatedAt,
    ...(typeof legacySourceMonth === "string" ? { legacySourceMonth } : {}),
  };
}

function parseRecurring(raw: unknown): RecurringExpense | null {
  if (!isRecord(raw)) return null;
  const { id, name, amountCents, category, dayOfMonth, active, lastRunMonth } = raw;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > 60
  )
    return null;
  if (!isPositiveInt(amountCents) || !isCategoryKey(category)) return null;
  if (
    !Number.isInteger(dayOfMonth) ||
    (dayOfMonth as number) < 1 ||
    (dayOfMonth as number) > 28
  )
    return null;
  if (typeof active !== "boolean") return null;
  if (
    lastRunMonth !== null &&
    (typeof lastRunMonth !== "string" || !isValidMonthKey(lastRunMonth))
  )
    return null;
  return {
    id,
    name: name.trim(),
    amountCents,
    category,
    dayOfMonth: dayOfMonth as number,
    active,
    lastRunMonth: lastRunMonth as string | null,
  };
}
