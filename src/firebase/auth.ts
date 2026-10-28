import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import type { Result, SessionUser } from "../types";
import { describeAuthError } from "./auth-errors";
import { getFirebaseAuth } from "./client";

function toSessionUser(user: User): SessionUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

/**
 * Abre la ventana de Google. Debe llamarse directamente desde un clic del usuario
 * (sin esperas antes), o el navegador bloqueará la ventana emergente.
 */
export async function signInWithGoogle(): Promise<Result<SessionUser>> {
  try {
    const provider = new GoogleAuthProvider();
    // Ofrece elegir cuenta aunque el móvil tenga varias abiertas.
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await signInWithPopup(getFirebaseAuth(), provider);
    return { ok: true, value: toSessionUser(credential.user) };
  } catch (error) {
    return { ok: false, error: describeAuthError(error) };
  }
}

export async function signOutUser(): Promise<Result<null>> {
  try {
    await signOut(getFirebaseAuth());
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: "No se pudo cerrar la sesión. Inténtalo de nuevo." };
  }
}

/** Avisa al arrancar y en cada cambio de sesión. Devuelve la función para darse de baja. */
export function watchAuthState(
  onChange: (user: SessionUser | null) => void,
  onError: (message: string) => void,
): () => void {
  return onAuthStateChanged(
    getFirebaseAuth(),
    (user) => onChange(user === null ? null : toSessionUser(user)),
    () => onError("No se pudo comprobar la sesión."),
  );
}
