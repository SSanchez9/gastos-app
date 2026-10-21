import { DATA_VERSION, STORAGE_KEY } from "./config";
import type { AppData } from "./types";
import { parseAppData } from "./validate";

const BACKUP_KEY = `${STORAGE_KEY}:corrupt-backup`;

export function createEmptyData(): AppData {
  return {
    version: DATA_VERSION,
    expenses: [],
    income: { byMonth: {} },
  };
}

function backupCorruptData(rawText: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, rawText);
  } catch {
    // Sin espacio o sin acceso: no hay nada más que hacer.
  }
}

export function loadData(): AppData {
  let rawText: string | null;
  try {
    rawText = localStorage.getItem(STORAGE_KEY);
  } catch {
    return createEmptyData();
  }
  if (rawText === null) return createEmptyData();

  try {
    const parsed: unknown = JSON.parse(rawText);
    const data = parseAppData(parsed);
    if (data !== null) return data;
  } catch {
    // JSON inválido: se trata igual que un documento no válido.
  }

  backupCorruptData(rawText);
  return createEmptyData();
}

/** Devuelve false si no se pudo guardar (almacenamiento lleno o bloqueado). */
export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
