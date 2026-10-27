import { api } from "./api.js";

/** Create an account. The backend validates, hashes the password and saves to Firestore. */
export async function registerUser({ name, email, password }) {
  try {
    await api("/register", { method: "POST", body: { name, email, password } });
  } catch (err) {
    if (err.code === "EMAIL_EXISTS") throw new Error("EMAIL_EXISTS");
    throw err;
  }
}

/** Log in. Resolves to { token, user } where token is the signed JWT. */
export async function loginUser(email, password) {
  try {
    return await api("/login", { method: "POST", body: { email, password } });
  } catch (err) {
    if (err.code === "INVALID_CREDENTIALS") throw new Error("INVALID_CREDENTIALS");
    throw err;
  }
}

/** Fetch the current user (including their plan) using the stored JWT. */
export async function fetchMe(token) {
  const { user } = await api("/me", { token });
  return user;
}

/** Validate payment details on the server and upgrade the plan to "paid". */
export async function upgradePlan(token, payment) {
  const { user } = await api("/upgrade", { method: "POST", token, body: payment });
  return user;
}
