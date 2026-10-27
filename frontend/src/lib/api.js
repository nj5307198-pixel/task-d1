export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function api(path, { method = "GET", body, token } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Could not reach the server. Is it running?");
    err.code = "NETWORK";
    throw err;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || "Something went wrong.");
    err.status = response.status;
    err.code = data.code;
    throw err;
  }
  return data;
}
