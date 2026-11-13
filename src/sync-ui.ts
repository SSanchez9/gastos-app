import * as state from "./state";
import { describeSync } from "./sync-status";
import type { AppState } from "./types";
import { getElement } from "./ui";

const syncDom = {
  shell: getElement("app-shell", HTMLDivElement),
  main: getElement("contenido", HTMLElement),
  banner: getElement("sync-banner", HTMLDivElement),
  message: getElement("sync-message", HTMLSpanElement),
  retry: getElement("sync-retry", HTMLButtonElement),
};

function renderSync(appState: AppState): void {
  const notice = describeSync(appState.sync);
  syncDom.banner.hidden = notice === null;
  syncDom.message.textContent = notice?.message ?? "";
  syncDom.retry.hidden = !(notice?.showRetry ?? false);
  // Mientras no hay datos (cargando o con error), la pantalla muestra el aviso en
  // lugar de estados vacíos que harían pensar que no tienes movimientos.
  syncDom.shell.dataset["sync"] = appState.sync.status;
  syncDom.banner.dataset["kind"] = !appState.sync.online
    ? "offline"
    : appState.sync.status === "error"
      ? "error"
      : "loading";
  syncDom.main.setAttribute("aria-busy", String(appState.sync.status === "loading"));
}

export function initSyncUi(): void {
  syncDom.retry.addEventListener("click", () => state.retrySync());
  state.subscribe(renderSync);
  renderSync(state.getState());
}
