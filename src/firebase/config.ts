export const firebaseConfig = {
  apiKey: "AIzaSyBfvQGUqr_m0mI8PtTY5MjE6-7NnB5h7Uc",
  authDomain: "gastos-app-baa6c.firebaseapp.com",
  projectId: "gastos-app-baa6c",
  storageBucket: "gastos-app-baa6c.firebasestorage.app",
  messagingSenderId: "1056023741811",
  appId: "1:1056023741811:web:42f5ef14649bf83e5c7106",
};

/** false mientras queden valores de ejemplo sin sustituir. */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((value) => !value.startsWith("PEGA_AQUI"));
}
