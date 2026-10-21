import { CURRENCY, LOCALE } from "./config";
import type { IsoDate, MonthKey } from "./types";

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
});

/** 1250 → "12,50 €" */
export function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

/** 1250 → "12,50" (para rellenar campos de formulario). */
export function centsToInputString(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${euros},${rest}`;
}

/**
 * Convierte lo que escribe el usuario en céntimos. Devuelve null si no es válido.
 * Acepta "12", "12,5", "12.50", "1.234,56" y "1,234.56".
 * Un punto solo seguido de tres cifras ("1.234") se interpreta como miles.
 */
export function eurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s€]/g, "");
  if (cleaned === "") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned
      .split(thousandsSeparator)
      .join("")
      .replace(decimalSeparator, ".");
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.split(".").join("");
  } else {
    normalized = cleaned;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  const whole = match?.[1];
  if (whole === undefined) return null;

  const decimals = (match?.[2] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(decimals);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "2026-10-19" → "2026-10" */
export function getMonthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

/** "2026-10-19" → "19 oct 2026" */
export function formatDate(date: IsoDate): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return dateFormatter.format(new Date(year, month - 1, day));
}

/** "2026-10" → "octubre de 2026" */
export function formatMonth(month: MonthKey): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthFormatter.format(new Date(year, monthNumber - 1, 1));
}

/** Suma o resta meses: shiftMonth("2026-01", -1) → "2025-12" */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  if (!isValidMonthKey(month)) {
    throw new RangeError(`Mes no válido: ${month}`);
  }
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const total = year * 12 + monthIndex + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, "0")}-${String(newMonth).padStart(2, "0")}`;
}

/** Fecha de hoy en el calendario local, en formato ISO. */
export function getTodayIso(): IsoDate {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function getCurrentMonthKey(): MonthKey {
  return getMonthKey(getTodayIso());
}

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
});

/** 35.2 → "35,2 %" (recibe el porcentaje como 35.2, no como 0.352). */
export function formatPercent(percent: number): string {
  return percentFormatter.format(percent / 100);
}
