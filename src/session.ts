import type { SessionUser } from "./types";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface Session {
  status: SessionStatus;
  user: SessionUser | null;
}

type Listener = (session: Session) => void;

let session: Session = { status: "loading", user: null };
const listeners = new Set<Listener>();

export function getSession(): Session {
  return session;
}

export function setSession(next: Session): void {
  session = next;
  for (const listener of listeners) listener(session);
}

/** Avisa en cada cambio. Devuelve una función para darse de baja. */
export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
