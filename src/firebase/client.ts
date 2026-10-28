import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { firebaseConfig } from "./config";

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance === null) {
    authInstance = getAuth(initializeApp(firebaseConfig));
  }
  return authInstance;
}
