import { getAuth, clearAuth } from "./auth";

const BASE_URL = import.meta.env.VITE_API_URL;

export async function apiFetch(path, options = {}) {
  const { token } = getAuth();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    clearAuth();
    window.location.href = "/login";
  }

  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}
