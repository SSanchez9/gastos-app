import { MAX_IMPORT_BYTES } from "./config";
import { formatDate, getTodayIso } from "./format";
import {
  buildFileName,
  describeReplacement,
  expensesToCsv,
  mergeAppData,
  parseBackupText,
  serializeAppData,
  summarizeData,
} from "./io";
import type { DataSummary, MergeReport } from "./io";
import * as state from "./state";
import type { AppData } from "./types";
import { getElement } from "./ui";

const backupDom = {
  exportJson: getElement("export-json", HTMLButtonElement),
  exportCsv: getElement("export-csv", HTMLButtonElement),
  importFile: getElement("import-file", HTMLInputElement),
  status: getElement("backup-status", HTMLParagraphElement),
  dialog: getElement("import-dialog", HTMLDialogElement),
  summary: getElement("import-summary", HTMLUListElement),
  merge: getElement("import-merge", HTMLButtonElement),
  replace: getElement("import-replace", HTMLButtonElement),
  exportCurrent: getElement("import-export-current", HTMLButtonElement),
  cancel: getElement("import-cancel", HTMLButtonElement),
};

/** Datos leídos del archivo, a la espera de que el usuario elija combinar o reemplazar. */
let pendingImport: AppData | null = null;
let onDataReplaced: () => void = () => undefined;

// ---------- Utilidades ----------

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describeCounts(summary: DataSummary): string {
  const expenses = plural(summary.expenseCount, "gasto", "gastos");
  const incomes = plural(summary.incomeMonthCount, "sueldo", "sueldos");
  return `${expenses} y ${incomes}`;
}

function describeRange(summary: DataSummary): string {
  if (summary.firstDate === null || summary.lastDate === null) return "";
  return ` (del ${formatDate(summary.firstDate)} al ${formatDate(summary.lastDate)})`;
}

function describeMerge(report: MergeReport): string {
  const parts: string[] = [];
  if (report.addedExpenses > 0) {
    parts.push(plural(report.addedExpenses, "gasto nuevo", "gastos nuevos"));
  }
  if (report.updatedExpenses > 0) {
    parts.push(
      plural(report.updatedExpenses, "gasto actualizado", "gastos actualizados"),
    );
  }
  if (report.addedIncomes > 0) {
    parts.push(plural(report.addedIncomes, "sueldo nuevo", "sueldos nuevos"));
  }

  let text =
    parts.length === 0
      ? "Combinar: no cambiaría ningún dato"
      : `Combinar: ${parts.join(", ")}`;
  if (report.conflictingIncomes > 0) {
    text += `. En ${plural(report.conflictingIncomes, "mes", "meses")} el sueldo difiere: se conserva el actual`;
  }
  return `${text}.`;
}

function createLine(text: string): HTMLLIElement {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function showStatus(message: string, isError = false): void {
  backupDom.status.textContent = message;
  backupDom.status.classList.toggle("hint--error", isError);
}

function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- Exportar ----------

function exportJson(): void {
  const { data } = state.getState();
  downloadFile(
    buildFileName("copia", "json", getTodayIso()),
    serializeAppData(data),
    "application/json",
  );
  showStatus(`Copia exportada: ${describeCounts(summarizeData(data))}.`);
}

function exportCsv(): void {
  const { expenses } = state.getState().data;
  if (expenses.length === 0) {
    showStatus("No hay gastos que exportar.", true);
    return;
  }
  downloadFile(
    buildFileName("gastos", "csv", getTodayIso()),
    expensesToCsv(expenses),
    "text/csv;charset=utf-8",
  );
  showStatus(`Exportados ${plural(expenses.length, "gasto", "gastos")} a CSV.`);
}

// ---------- Importar ----------

function openImportDialog(incoming: AppData): void {
  const current = state.getState().data;
  const incomingInfo = summarizeData(incoming);
  const currentInfo = summarizeData(current);
  const { report } = mergeAppData(current, incoming);
  const replacement = describeReplacement(current, incoming);

  const lines = [
    `Archivo: ${describeCounts(incomingInfo)}${describeRange(incomingInfo)}.`,
    `Tus datos actuales: ${describeCounts(currentInfo)}.`,
    describeMerge(report),
    `Reemplazar: se eliminarán ${plural(replacement.removedExpenses, "gasto", "gastos")} y ${plural(replacement.removedIncomes, "sueldo", "sueldos")} que no están en el archivo.`,
  ];
  backupDom.summary.replaceChildren(...lines.map(createLine));

  pendingImport = incoming;
  backupDom.dialog.showModal();
}

async function handleFileSelected(): Promise<void> {
  const file = backupDom.importFile.files?.item(0) ?? null;
  // Se vacía el selector para poder elegir el mismo archivo otra vez.
  backupDom.importFile.value = "";
  if (file === null) return;

  if (file.size > MAX_IMPORT_BYTES) {
    showStatus("El archivo es demasiado grande (máximo 5 MB).", true);
    return;
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    showStatus("No se pudo leer el archivo.", true);
    return;
  }

  const parsed = parseBackupText(text);
  if (!parsed.ok) {
    showStatus(parsed.error, true);
    return;
  }

  showStatus("");
  openImportDialog(parsed.value);
}

function applyImport(mode: "merge" | "replace"): void {
  const incoming = pendingImport;
  if (incoming === null) return;
  const current = state.getState().data;

  let message: string;
  if (mode === "merge") {
    const { data, report } = mergeAppData(current, incoming);
    state.replaceAllData(data);
    message = `Copia combinada: ${plural(report.addedExpenses, "gasto añadido", "gastos añadidos")} y ${plural(report.updatedExpenses, "actualizado", "actualizados")}.`;
  } else {
    state.replaceAllData(incoming);
    const summary = summarizeData(incoming);
    if (summary.lastMonth !== null) state.setSelectedMonth(summary.lastMonth);
    message = `Datos reemplazados: ${describeCounts(summary)}.`;
  }

  pendingImport = null;
  backupDom.dialog.close();
  onDataReplaced();
  showStatus(message);
}

// ---------- Arranque ----------

export function initBackup(options: { onDataReplaced: () => void }): void {
  onDataReplaced = options.onDataReplaced;

  backupDom.exportJson.addEventListener("click", exportJson);
  backupDom.exportCsv.addEventListener("click", exportCsv);
  backupDom.importFile.addEventListener("change", () => {
    void handleFileSelected();
  });

  backupDom.merge.addEventListener("click", () => applyImport("merge"));
  backupDom.replace.addEventListener("click", () => applyImport("replace"));
  backupDom.exportCurrent.addEventListener("click", exportJson);
  backupDom.cancel.addEventListener("click", () => backupDom.dialog.close());
  // También se dispara al cerrar con la tecla Escape.
  backupDom.dialog.addEventListener("close", () => {
    pendingImport = null;
  });
}
