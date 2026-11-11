// Client-side helpers for calling the Go API through the /api rewrite.

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: "super_admin" | "admin";
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** POST JSON to /api<path>. Throws ApiError with the server's message on failure. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** GET /api<path>. Throws ApiError with status 401 when the session is missing or expired. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET", cache: "no-store" });
}
