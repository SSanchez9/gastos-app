import { NOTE_MAX_LENGTH } from "./config";
import { eurosToCents, isValidIsoDate } from "./format";
import type { IsoDate } from "./types";

/** Parámetros del enlace que abre «Añadir movimiento» ya relleno (p. ej. desde Atajos). */
const LINK_PARAMS = ["nuevo", "importe", "comercio", "fecha"] as const;

export interface ExpenseLink {
  amountCents: number;
  note: string;
  /** null si falta o no es válida: se usará la fecha de hoy. */
  date: IsoDate | null;
}

/**
 * Lee un enlace como `?nuevo=1&importe=12,50&comercio=Mercadona&fecha=2026-11-17`.
 * Devuelve null si no pide un gasto nuevo o si el importe no es válido.
 */
export function parseExpenseLink(search: string): ExpenseLink | null {
  const params = new URLSearchParams(search);
  if (!params.has("nuevo")) return null;

  // «12,50 €», «€12.50», «1.234,56»: solo cuentan las cifras y los separadores.
  const amount = (params.get("importe") ?? "").replace(/[^\d.,]/g, "");
  const amountCents = eurosToCents(amount);
  if (amountCents === null || amountCents <= 0) return null;

  const note = (params.get("comercio") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NOTE_MAX_LENGTH)
    .trim();
  const date = params.get("fecha") ?? "";
  return { amountCents, note, date: isValidIsoDate(date) ? date : null };
}

/** Quita del `search` los parámetros del enlace y conserva el resto. */
export function stripExpenseLinkParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of LINK_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
