import * as state from "./state";
import { describeSync } from "./sync-status";
import type { AppState } from "./types";
import { getElement } from "./ui";

const syncDom = {
  banner: getElement("sync-banner", HTMLDivElement),
  message: getElement("sync-message", HTMLSpanElement),
  retry: getElement("sync-retry", HTMLButtonElement),
};

function renderSync(appState: AppState): void {
  const notice = describeSync(appState.sync);
  syncDom.banner.hidden = notice === null;
  syncDom.message.textContent = notice?.message ?? "";
  syncDom.retry.hidden = !(notice?.showRetry ?? false);
}

export function initSyncUi(): void {
  syncDom.retry.addEventListener("click", () => state.retrySync());
  state.subscribe(renderSync);
  renderSync(state.getState());
}
