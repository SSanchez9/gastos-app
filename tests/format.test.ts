import { describe, expect, it } from "vitest";
import {
  centsToInputString,
  eurosToCents,
  formatDate,
  formatMonth,
  formatMoney,
  getMonthKey,
  isValidIsoDate,
  isValidMonthKey,
  shiftMonth,
} from "../src/format";

describe("eurosToCents", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12.50", 1250],
    ["0,05", 5],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    [" 12,30 € ", 1230],
  ])("convierte %s en %i céntimos", (input, expected) => {
    expect(eurosToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12,345", "1.2.3", "12,5,5", "1e3"])(
    "rechaza %j",
    (input) => {
      expect(eurosToCents(input)).toBeNull();
    },
  );
});

describe("centsToInputString", () => {
  it("formatea para un campo de formulario", () => {
    expect(centsToInputString(1250)).toBe("12,50");
    expect(centsToInputString(5)).toBe("0,05");
    expect(centsToInputString(100000)).toBe("1000,00");
  });
});

describe("formatMoney", () => {
  it("usa formato español con euros", () => {
    expect(formatMoney(1250).replace(/\s/g, " ")).toBe("12,50 €");
    expect(formatMoney(0).replace(/\s/g, " ")).toBe("0,00 €");
    expect(formatMoney(1234567).replace(/\s/g, " ")).toBe("12.345,67 €");
  });
});

describe("fechas", () => {
  it("valida fechas ISO reales", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("19/10/2026")).toBe(false);
  });

  it("valida claves de mes", () => {
    expect(isValidMonthKey("2026-10")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-1")).toBe(false);
  });

  it("extrae el mes de una fecha", () => {
    expect(getMonthKey("2026-10-19")).toBe("2026-10");
  });

  it("formatea fechas y meses en español", () => {
    expect(formatDate("2026-10-19")).toMatch(/^19 oct\.? 2026$/);
    expect(formatMonth("2026-10")).toMatch(/octubre.*2026/);
  });

  it("suma y resta meses cruzando años", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
  });

  it("rechaza meses no válidos", () => {
    expect(() => shiftMonth("2026-99", 1)).toThrow(RangeError);
  });
});
