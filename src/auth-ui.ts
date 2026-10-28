import { signInWithGoogle, signOutUser, watchAuthState } from "./firebase/auth";
import { isFirebaseConfigured } from "./firebase/config";
import { getSession, setSession, subscribeSession } from "./session";
import type { Session } from "./session";
import { getElement } from "./ui";

const authDom = {
  loginScreen: getElement("login-screen", HTMLElement),
  appShell: getElement("app-shell", HTMLDivElement),
  status: getElement("login-status", HTMLParagraphElement),
  error: getElement("login-error", HTMLParagraphElement),
  signIn: getElement("sign-in", HTMLButtonElement),
  signOut: getElement("sign-out", HTMLButtonElement),
  email: getElement("session-email", HTMLSpanElement),
};

const configMissing = !isFirebaseConfigured();

function showLoginError(message: string): void {
  authDom.error.textContent = message;
  authDom.error.hidden = false;
}

function clearLoginError(): void {
  authDom.error.textContent = "";
  authDom.error.hidden = true;
}

function describeStatus(session: Session): string {
  switch (session.status) {
    case "loading":
      return "Comprobando sesión…";
    case "signed-out":
      return "Inicia sesión con tu cuenta de Google para acceder a tus gastos.";
    case "signed-in":
      return "";
  }
}

function renderSession(session: Session): void {
  const signedIn = session.status === "signed-in";
  authDom.appShell.hidden = !signedIn;
  authDom.loginScreen.hidden = signedIn;
  authDom.status.textContent = describeStatus(session);
  authDom.signIn.hidden = session.status !== "signed-out" || configMissing;
  authDom.email.textContent = session.user?.email ?? session.user?.displayName ?? "";
}

async function handleSignIn(): Promise<void> {
  clearLoginError();
  authDom.signIn.disabled = true;
  // signInWithGoogle se invoca antes de cualquier espera: así cuenta como acción del usuario.
  const result = await signInWithGoogle();
  authDom.signIn.disabled = false;
  if (!result.ok) showLoginError(result.error);
  // Si todo va bien, watchAuthState actualiza la sesión y la pantalla.
}

async function handleSignOut(): Promise<void> {
  const result = await signOutUser();
  if (!result.ok) window.alert(result.error);
}

export function initAuthUi(): void {
  subscribeSession(renderSession);
  renderSession(getSession());

  authDom.signIn.addEventListener("click", () => {
    void handleSignIn();
  });
  authDom.signOut.addEventListener("click", () => {
    void handleSignOut();
  });

  if (configMissing) {
    setSession({ status: "signed-out", user: null });
    showLoginError(
      "Falta la configuración de Firebase: edita src/firebase/config.ts con los datos de tu proyecto.",
    );
    return;
  }

  watchAuthState(
    (user) =>
      setSession(
        user === null
          ? { status: "signed-out", user: null }
          : { status: "signed-in", user },
      ),
    (message) => {
      setSession({ status: "signed-out", user: null });
      showLoginError(message);
    },
  );
}
