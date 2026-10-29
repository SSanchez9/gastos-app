import { describe, expect, it } from "vitest";
import { describeSync } from "../src/sync-status";

describe("describeSync", () => {
  it("no muestra aviso sin sesión", () => {
    expect(describeSync({ status: "signed-out", online: true, error: null })).toBeNull();
  });

  it("no muestra aviso cuando todo va bien", () => {
    expect(describeSync({ status: "ready", online: true, error: null })).toBeNull();
  });

  it("avisa mientras carga", () => {
    const notice = describeSync({ status: "loading", online: true, error: null });
    expect(notice?.message).toMatch(/Cargando/);
    expect(notice?.showRetry).toBe(false);
  });

  it("avisa de que no hay conexión, con datos cargados o sin cargar", () => {
    expect(
      describeSync({ status: "ready", online: false, error: null })?.message,
    ).toMatch(/Sin conexión/);
    expect(
      describeSync({ status: "loading", online: false, error: null })?.message,
    ).toMatch(/Sin conexión/);
  });

  it("muestra el error con opción de reintentar", () => {
    const notice = describeSync({
      status: "error",
      online: true,
      error: "Fallo de prueba",
    });
    expect(notice).toEqual({ message: "Fallo de prueba", showRetry: true });
  });

  it("usa un mensaje por defecto si el error no tiene texto", () => {
    const notice = describeSync({ status: "error", online: true, error: null });
    expect(notice?.message).toMatch(/No se pudieron cargar/);
  });
});
