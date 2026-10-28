const AUTH_ERROR_MESSAGES = new Map<string, string>([
  [
    "auth/popup-closed-by-user",
    "Cerraste la ventana de Google antes de terminar. Inténtalo de nuevo.",
  ],
  [
    "auth/cancelled-popup-request",
    "Cerraste la ventana de Google antes de terminar. Inténtalo de nuevo.",
  ],
  [
    "auth/popup-blocked",
    "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.",
  ],
  [
    "auth/network-request-failed",
    "No hay conexión. Comprueba internet e inténtalo de nuevo.",
  ],
  [
    "auth/unauthorized-domain",
    "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).",
  ],
  [
    "auth/operation-not-allowed",
    "El inicio de sesión con Google no está activado en Firebase.",
  ],
]);

const DEFAULT_AUTH_ERROR = "No se pudo iniciar sesión. Inténtalo de nuevo.";

function readErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return "";
}

/** Traduce un error de Firebase Auth a un mensaje comprensible. */
export function describeAuthError(error: unknown): string {
  return AUTH_ERROR_MESSAGES.get(readErrorCode(error)) ?? DEFAULT_AUTH_ERROR;
}
