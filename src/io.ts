import { findCategory, getCategories } from "./categories";
import { BACKUP_VERSION } from "./config";
import { centsToInputString, getMonthKey } from "./format";
import type { AppData, Expense, IsoDate, MonthKey, Result } from "./types";
import { parseAppData } from "./validate";

// ---------- Archivos ----------

export type FileKind = "copia" | "gastos";
export type FileExtension = "json" | "csv";

/** buildFileName("copia", "json", "2026-10-21") → "gastos-app-copia-2026-10-21.json" */
export function buildFileName(
  kind: FileKind,
  extension: FileExtension,
  isoDate: IsoDate,
): string {
  return `gastos-app-${kind}-${isoDate}.${extension}`;
}

// ---------- JSON ----------

export function serializeAppData(data: AppData): string {
  return JSON.stringify({ ...data, version: BACKUP_VERSION }, null, 2);
}

/** Convierte el texto de un archivo en datos válidos, o explica por qué no. */
export function parseBackupText(text: string): Result<AppData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }

  const normalized =
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>)["version"] === BACKUP_VERSION
      ? { ...(raw as Record<string, unknown>), version: 1 }
      : raw;
  const data = parseAppData(normalized);
  if (data === null) {
    return {
      ok: false,
      error: "El archivo no es una copia de seguridad válida de Gastos App.",
    };
  }
  return { ok: true, value: data };
}

// ---------- Resumen ----------

export interface DataSummary {
  expenseCount: number;
  incomeMonthCount: number;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  /** Mes más reciente con gastos o con sueldo registrado. */
  lastMonth: MonthKey | null;
}

export function summarizeData(data: AppData): DataSummary {
  let firstDate: IsoDate | null = null;
  let lastDate: IsoDate | null = null;
  for (const expense of data.expenses) {
    if (firstDate === null || expense.date < firstDate) firstDate = expense.date;
    if (lastDate === null || expense.date > lastDate) lastDate = expense.date;
  }

  const incomeMonths = [
    ...new Set([
      ...Object.keys(data.income.byMonth).filter(
        (month) => !(data.migratedIncomeMonths ?? []).includes(month),
      ),
      ...(data.incomeEntries ?? []).map((entry) => getMonthKey(entry.date)),
    ]),
  ];
  let lastMonth: MonthKey | null = lastDate === null ? null : getMonthKey(lastDate);
  for (const month of incomeMonths) {
    if (lastMonth === null || month > lastMonth) lastMonth = month;
  }

  return {
    expenseCount: data.expenses.length,
    incomeMonthCount: incomeMonths.length,
    firstDate,
    lastDate,
    lastMonth,
  };
}

// ---------- Combinar y reemplazar ----------

export interface MergeReport {
  addedExpenses: number;
  updatedExpenses: number;
  unchangedExpenses: number;
  addedIncomes: number;
  /** Meses con sueldo distinto en ambos sitios: se conserva el actual. */
  conflictingIncomes: number;
}

/**
 * Combina los datos actuales con los importados sin modificar ninguno de los dos.
 * Gastos: por id, gana el de updatedAt más reciente. Sueldos: se conserva el actual.
 */
export function mergeAppData(
  current: AppData,
  incoming: AppData,
): { data: AppData; report: MergeReport } {
  const expenses = [...current.expenses];
  const indexById = new Map(
    expenses.map((expense, index) => [expense.id, index] as const),
  );

  let addedExpenses = 0;
  let updatedExpenses = 0;
  let unchangedExpenses = 0;

  for (const item of incoming.expenses) {
    const index = indexById.get(item.id);
    if (index === undefined) {
      indexById.set(item.id, expenses.length);
      expenses.push(item);
      addedExpenses += 1;
      continue;
    }

    const existing = expenses[index];
    if (existing !== undefined && item.updatedAt > existing.updatedAt) {
      expenses[index] = item;
      updatedExpenses += 1;
    } else {
      unchangedExpenses += 1;
    }
  }

  const byMonth = { ...current.income.byMonth };
  let addedIncomes = 0;
  let conflictingIncomes = 0;
  for (const [month, cents] of Object.entries(incoming.income.byMonth)) {
    const existing = byMonth[month];
    if (existing === undefined) {
      byMonth[month] = cents;
      addedIncomes += 1;
    } else if (existing !== cents) {
      conflictingIncomes += 1;
    }
  }

  const data: AppData = {
    version: current.version,
    expenses,
    income: { byMonth },
  };
  if (current.budgets !== undefined || incoming.budgets !== undefined) {
    data.budgets = {
      ...(current.budgets ?? {}),
      ...Object.fromEntries(
        Object.entries(incoming.budgets ?? {}).filter(
          ([month]) => current.budgets?.[month] === undefined,
        ),
      ),
    };
  }
  if (current.goals !== undefined || incoming.goals !== undefined) {
    data.goals = mergeById(current.goals ?? [], incoming.goals ?? [], (a, b) => ({
      ...a,
      savedCents: Math.max(a.savedCents, b.savedCents),
    }));
  }
  if (current.recurring !== undefined || incoming.recurring !== undefined) {
    data.recurring = mergeById(
      current.recurring ?? [],
      incoming.recurring ?? [],
      (a, b) => ({
        ...a,
        lastRunMonth:
          (a.lastRunMonth ?? "") > (b.lastRunMonth ?? "")
            ? a.lastRunMonth
            : b.lastRunMonth,
      }),
    );
  }
  if (current.wallets !== undefined || incoming.wallets !== undefined) {
    data.wallets = mergeById(current.wallets ?? [], incoming.wallets ?? [], (a) => a);
  }
  // Categorías: se conservan las actuales (también las calculadas si aún no hay lista)
  // y se añaden las de la copia que no existan. Ante el mismo id gana la actual.
  if (current.categories !== undefined || incoming.categories !== undefined) {
    data.categories = mergeById(
      getCategories(current),
      getCategories(incoming),
      (a) => a,
    );
  }
  if (current.transfers !== undefined || incoming.transfers !== undefined) {
    data.transfers = mergeById(
      current.transfers ?? [],
      incoming.transfers ?? [],
      (a) => a,
    );
  }
  if (current.incomeEntries !== undefined || incoming.incomeEntries !== undefined) {
    data.incomeEntries = mergeById(
      current.incomeEntries ?? [],
      incoming.incomeEntries ?? [],
      (a, b) => (a.updatedAt >= b.updatedAt ? a : b),
    );
  }
  if (
    current.migratedIncomeMonths !== undefined ||
    incoming.migratedIncomeMonths !== undefined
  ) {
    data.migratedIncomeMonths = [
      ...new Set([
        ...(current.migratedIncomeMonths ?? []),
        ...(incoming.migratedIncomeMonths ?? []),
      ]),
    ].sort();
  }
  return {
    data,
    report: {
      addedExpenses,
      updatedExpenses,
      unchangedExpenses,
      addedIncomes,
      conflictingIncomes,
    },
  };
}

function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  combine: (current: T, incoming: T) => T,
): T[] {
  const merged = [...current];
  const positions = new Map(merged.map((item, index) => [item.id, index] as const));
  for (const item of incoming) {
    const index = positions.get(item.id);
    if (index === undefined) {
      positions.set(item.id, merged.length);
      merged.push(item);
    } else {
      const existing = merged[index];
      if (existing) merged[index] = combine(existing, item);
    }
  }
  return merged;
}

export interface ReplaceReport {
  removedExpenses: number;
  removedIncomes: number;
  removedGoals?: number;
  removedRecurring?: number;
  removedWallets?: number;
  removedTransfers?: number;
}

/** Qué se perdería al reemplazar los datos actuales por los importados. */
export function describeReplacement(current: AppData, incoming: AppData): ReplaceReport {
  const incomingIds = new Set(incoming.expenses.map((expense) => expense.id));
  const removedExpenses = current.expenses.filter(
    (expense) => !incomingIds.has(expense.id),
  ).length;
  const removedIncomes = Object.keys(current.income.byMonth).filter(
    (month) => incoming.income.byMonth[month] === undefined,
  ).length;
  const countRemoved = <T extends { id: string }>(
    currentItems: T[],
    incomingItems: T[],
  ): number => {
    const incomingIds = new Set(incomingItems.map((item) => item.id));
    return currentItems.filter((item) => !incomingIds.has(item.id)).length;
  };
  const report: ReplaceReport = {
    removedExpenses,
    removedIncomes,
  };
  const removedGoals = countRemoved(current.goals ?? [], incoming.goals ?? []);
  const removedRecurring = countRemoved(
    current.recurring ?? [],
    incoming.recurring ?? [],
  );
  const removedWallets = countRemoved(current.wallets ?? [], incoming.wallets ?? []);
  const removedTransfers = countRemoved(
    current.transfers ?? [],
    incoming.transfers ?? [],
  );
  if (removedGoals > 0) report.removedGoals = removedGoals;
  if (removedRecurring > 0) report.removedRecurring = removedRecurring;
  if (removedWallets > 0) report.removedWallets = removedWallets;
  if (removedTransfers > 0) report.removedTransfers = removedTransfers;
  return report;
}

// ---------- CSV ----------

const CSV_SEPARATOR = ";";
const CSV_LINE_BREAK = "\r\n";
/** Marca de orden de bytes: hace que Excel lea el archivo como UTF-8 (tildes y €). */
const CSV_BOM = "\uFEFF";

/**
 * Prepara una celda: evita que una hoja de cálculo ejecute como fórmula un texto
 * que empieza por = + - @ y entrecomilla si contiene separador, comillas o saltos.
 */
function escapeCsvCell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Gastos en CSV para es-ES: separador ";" e importes con coma decimal. La columna
 * Categoría lleva el nombre de la categoría de la persona (`categories`).
 */
export function expensesToCsv(
  expenses: readonly Expense[],
  categories: Parameters<typeof findCategory>[0] = [],
): string {
  const header = ["Fecha", "Categoría", "Nota", "Importe (€)"];
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((expense) => [
      expense.date,
      findCategory(categories, expense.category).name,
      expense.note,
      centsToInputString(expense.amountCents),
    ]);

  const lines = [header, ...rows].map((cells) =>
    cells.map(escapeCsvCell).join(CSV_SEPARATOR),
  );
  return CSV_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
