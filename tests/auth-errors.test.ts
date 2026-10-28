import { describe, expect, it } from "vitest";
import { describeAuthError } from "../src/firebase/auth-errors";

describe("describeAuthError", () => {
  it("traduce los códigos conocidos", () => {
    expect(describeAuthError({ code: "auth/popup-blocked" })).toMatch(/bloqueó/);
    expect(describeAuthError({ code: "auth/network-request-failed" })).toMatch(
      /conexión/,
    );
    expect(describeAuthError({ code: "auth/unauthorized-domain" })).toMatch(/autorizado/);
  });

  it("trata igual cerrar la ventana y cancelar la petición", () => {
    expect(describeAuthError({ code: "auth/cancelled-popup-request" })).toBe(
      describeAuthError({ code: "auth/popup-closed-by-user" }),
    );
  });

  it("usa un mensaje genérico para códigos desconocidos", () => {
    expect(describeAuthError({ code: "auth/algo-raro" })).toMatch(
      /No se pudo iniciar sesión/,
    );
  });

  it("usa el mensaje genérico si el error no tiene código", () => {
    for (const error of [new Error("x"), "texto", null, undefined, 42]) {
      expect(describeAuthError(error)).toMatch(/No se pudo iniciar sesión/);
    }
  });

  it("no se deja engañar por claves heredadas de los objetos", () => {
    expect(describeAuthError({ code: "constructor" })).toMatch(
      /No se pudo iniciar sesión/,
    );
  });
});
