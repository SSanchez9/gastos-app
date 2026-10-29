const FIRESTORE_ERROR_MESSAGES = new Map<string, string>([
  [
    "permission-denied",
    "Firebase rechazó el acceso a tus datos. Comprueba que las reglas de Firestore están publicadas y que has entrado con tu cuenta.",
  ],
  ["unauthenticated", "Tu sesión ha caducado. Cierra sesión y vuelve a entrar."],
  ["unavailable", "No se pudo conectar con Firebase. Comprueba tu conexión."],
  ["deadline-exceeded", "No se pudo conectar con Firebase. Comprueba tu conexión."],
  [
    "resource-exhausted",
    "Se ha superado la cuota gratuita de Firebase. Inténtalo de nuevo más tarde.",
  ],
  [
    "not-found",
    "No se encontró el dato (puede que se haya borrado desde otro dispositivo) o la base de datos no existe.",
  ],
]);

const DEFAULT_FIRESTORE_ERROR = "No se pudo completar la operación. Inténtalo de nuevo.";

function readErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code).replace(/^firestore\//, "");
  }
  return "";
}

/** Traduce un error de Firestore a un mensaje comprensible. */
export function describeFirestoreError(error: unknown): string {
  return FIRESTORE_ERROR_MESSAGES.get(readErrorCode(error)) ?? DEFAULT_FIRESTORE_ERROR;
}
