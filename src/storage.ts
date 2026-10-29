import { DATA_VERSION, STORAGE_KEY } from "./config";
import type { AppData } from "./types";
import { parseAppData } from "./validate";

export function createEmptyData(): AppData {
  return {
    version: DATA_VERSION,
    expenses: [],
    income: { byMonth: {} },
  };
}

/**
 * Datos que versiones anteriores guardaron en este navegador.
 * Devuelve null si no hay nada, están vacíos o no son válidos.
 */
export function loadLegacyData(): AppData | null {
  let rawText: string | null;
  try {
    rawText = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (rawText === null) return null;

  try {
    const data = parseAppData(JSON.parse(rawText) as unknown);
    if (data === null) return null;
    const isEmpty =
      data.expenses.length === 0 && Object.keys(data.income.byMonth).length === 0;
    return isEmpty ? null : data;
  } catch {
    return null;
  }
}

export function clearLegacyData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar.
  }
}
