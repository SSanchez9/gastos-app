import { getSavingsSummary } from "./calc";
import { isValidIsoDate, isValidMonthKey, shiftMonth } from "./format";
import type {
  AppData,
  IsoDate,
  MonthKey,
  Result,
  SavingsAdjustment,
  SavingsSettings,
} from "./types";

export const SAVINGS_TITLE_MAX_LENGTH = 60;

/** Datos que escribe la persona al añadir o editar un ajuste. */
export interface SavingsAdjustmentInput {
  kind: SavingsAdjustment["kind"];
  title: string;
  amountCents: number;
  date: IsoDate;
}

export interface SavingsHistoryMonth {
  month: MonthKey;
  /** Ingresos − gastos del mes; null si no tiene sueldo. */
  surplusCents: number | null;
  /** Ahorro al final del mes; null si es anterior a la base. */
  totalCents: number | null;
}

export interface SavingsOverview {
  baseCents: number;
  baseMonth: MonthKey;
  /** El mes elegido es anterior a la base: aún no hay total. */
  beforeBase: boolean;
  /** Suma de lo que sobró en los meses con sueldo, de la base al mes elegido. */
  surplusCents: number;
  /** Meses con sueldo que se han sumado. */
  countedMonths: number;
  /** Meses sin sueldo desde la base: no se suman. */
  missingIncomeMonths: MonthKey[];
  adjustmentsCents: number;
  /** Ahorro al final del mes elegido (o hasta hoy si es el mes en curso). */
  totalCents: number;
  /** Lo que sobra en el mes elegido; null si no tiene sueldo. */
  monthSurplusCents: number | null;
  /** Los seis meses que terminan en el mes elegido. */
  history: SavingsHistoryMonth[];
}

/** Valor con signo de un ajuste: suma si entra, resta si sale. */
export function adjustmentValue(adjustment: SavingsAdjustment): number {
  return adjustment.kind === "in" ? adjustment.amountCents : -adjustment.amountCents;
}

function surplusOf(data: AppData, month: MonthKey): number | null {
  return getSavingsSummary(data, month).savedCents;
}

/** Ahorro al final de `month` (si es anterior a la base, null). */
function totalThrough(
  data: AppData,
  savings: SavingsSettings,
  month: MonthKey,
): number | null {
  if (month < savings.baseMonth) return null;
  let total = savings.baseCents;
  for (
    let current = savings.baseMonth;
    current <= month;
    current = shiftMonth(current, 1)
  )
    total += surplusOf(data, current) ?? 0;
  for (const adjustment of savings.adjustments) {
    const adjustmentMonth = adjustment.date.slice(0, 7);
    if (adjustmentMonth >= savings.baseMonth && adjustmentMonth <= month)
      total += adjustmentValue(adjustment);
  }
  return total;
}

/**
 * Resumen de la pantalla Ahorro hasta el mes elegido. Devuelve null si la persona aún
 * no ha indicado su ahorro base. Los meses sin sueldo no suman (nunca se supone uno)
 * y los ajustes anteriores a la base no cuentan: ya forman parte de ella.
 */
export function getSavingsOverview(
  data: AppData,
  month: MonthKey,
): SavingsOverview | null {
  const savings = data.savings;
  if (savings === undefined) return null;

  let surplusCents = 0;
  let countedMonths = 0;
  const missingIncomeMonths: MonthKey[] = [];
  for (
    let current = savings.baseMonth;
    current <= month;
    current = shiftMonth(current, 1)
  ) {
    const surplus = surplusOf(data, current);
    if (surplus === null) missingIncomeMonths.push(current);
    else {
      surplusCents += surplus;
      countedMonths += 1;
    }
  }
  const adjustmentsCents = savings.adjustments
    .filter((adjustment) => {
      const adjustmentMonth = adjustment.date.slice(0, 7);
      return adjustmentMonth >= savings.baseMonth && adjustmentMonth <= month;
    })
    .reduce((total, adjustment) => total + adjustmentValue(adjustment), 0);

  const history = Array.from({ length: 6 }, (_, index) => {
    const historyMonth = shiftMonth(month, index - 5);
    return {
      month: historyMonth,
      surplusCents: surplusOf(data, historyMonth),
      totalCents: totalThrough(data, savings, historyMonth),
    };
  });

  return {
    baseCents: savings.baseCents,
    baseMonth: savings.baseMonth,
    beforeBase: month < savings.baseMonth,
    surplusCents,
    countedMonths,
    missingIncomeMonths,
    adjustmentsCents,
    totalCents: savings.baseCents + surplusCents + adjustmentsCents,
    monthSurplusCents: surplusOf(data, month),
    history,
  };
}

/** Comprueba el ahorro base. Puede ser 0 (empiezas de cero). */
export function checkSavingsBase(baseCents: number, baseMonth: string): Result<null> {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0)
    return { ok: false, error: "Introduce un importe válido, por ejemplo 8.000,00." };
  if (!isValidMonthKey(baseMonth))
    return { ok: false, error: "Elige el mes desde el que cuenta tu ahorro." };
  return { ok: true, value: null };
}

/** Comprueba y limpia los datos de un ajuste. */
export function checkSavingsAdjustment(
  input: SavingsAdjustmentInput,
): Result<SavingsAdjustmentInput> {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (input.kind !== "in" && input.kind !== "out")
    return { ok: false, error: "Elige si el dinero entra o sale del ahorro." };
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    return { ok: false, error: "Introduce un importe válido, por ejemplo 150,00." };
  if (!title) return { ok: false, error: "Escribe un concepto, por ejemplo «Regalo»." };
  if (title.length > SAVINGS_TITLE_MAX_LENGTH)
    return {
      ok: false,
      error: `El concepto no puede superar los ${SAVINGS_TITLE_MAX_LENGTH} caracteres.`,
    };
  if (!isValidIsoDate(input.date)) return { ok: false, error: "Elige una fecha válida." };
  return { ok: true, value: { ...input, title } };
}
