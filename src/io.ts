import { CATEGORIES } from "./config";
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
  return JSON.stringify(data, null, 2);
}

/** Convierte el texto de un archivo en datos válidos, o explica por qué no. */
export function parseBackupText(text: string): Result<AppData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }

  const data = parseAppData(raw);
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

  const incomeMonths = Object.keys(data.income.byMonth);
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

  return {
    data: { version: current.version, expenses, income: { byMonth } },
    report: {
      addedExpenses,
      updatedExpenses,
      unchangedExpenses,
      addedIncomes,
      conflictingIncomes,
    },
  };
}

export interface ReplaceReport {
  removedExpenses: number;
  removedIncomes: number;
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
  return { removedExpenses, removedIncomes };
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

/** Gastos en CSV para es-ES: separador ";" e importes con coma decimal. */
export function expensesToCsv(expenses: readonly Expense[]): string {
  const header = ["Fecha", "Categoría", "Nota", "Importe (€)"];
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((expense) => [
      expense.date,
      CATEGORIES[expense.category].label,
      expense.note,
      centsToInputString(expense.amountCents),
    ]);

  const lines = [header, ...rows].map((cells) =>
    cells.map(escapeCsvCell).join(CSV_SEPARATOR),
  );
  return CSV_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
