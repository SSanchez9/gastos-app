import type { SyncState } from "./types";

export interface SyncNotice {
  message: string;
  showRetry: boolean;
}

/** Aviso a mostrar según el estado de la sincronización; null si todo va bien. */
export function describeSync(sync: SyncState): SyncNotice | null {
  switch (sync.status) {
    case "signed-out":
      return null;
    case "error":
      return {
        message: sync.error ?? "No se pudieron cargar tus datos.",
        showRetry: true,
      };
    case "loading":
      return {
        message: sync.online
          ? "Cargando tus datos…"
          : "Sin conexión: no se pueden cargar tus datos.",
        showRetry: false,
      };
    case "ready":
      return sync.online
        ? null
        : {
            message:
              "Sin conexión: no se pueden guardar cambios hasta que vuelvas a conectarte.",
            showRetry: false,
          };
  }
}
