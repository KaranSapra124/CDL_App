// Client-side helpers for calling the Go API through the /api rewrite.

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: "super_admin" | "admin";
};

export class ApiError extends Error {
  status: number;
  /** Set by the publish endpoint: the things that still need fixing. */
  problems: string[];

  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}

function toApiError(res: Response | null, data: Record<string, unknown> | null): ApiError {
  if (!res) {
    return new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  const message =
    data && typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
  const problems = Array.isArray(data?.problems) ? (data.problems as string[]) : [];
  return new ApiError(res.status, message, problems);
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw toApiError(null, null);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw toApiError(res, data);
  return data as T;
}

/** POST JSON to /api<path>. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** PATCH, PUT or DELETE with an optional JSON body. */
export function apiSend<T>(method: "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** GET /api<path>. Throws ApiError with status 401 when the session is missing or expired. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET", cache: "no-store" });
}

/**
 * Where uploads are sent. Empty means the same origin, which is how production works (Nginx routes
 * /api to the Go API). In development the Next.js dev proxy caps request bodies at 10 MB, so set
 * NEXT_PUBLIC_API_UPLOAD_URL=http://localhost:8080 to send files straight to the Go API.
 */
const UPLOAD_BASE = process.env.NEXT_PUBLIC_API_UPLOAD_URL ?? "";

/**
 * Uploads one file as multipart form data and reports progress (0 to 1).
 * Uses XMLHttpRequest because fetch() cannot report upload progress.
 */
export function apiUpload<T>(
  path: string,
  field: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${UPLOAD_BASE}/api${path}`);
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(toApiError(null, null));
    xhr.onload = () => {
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          data && typeof data.error === "string" ? data.error : "Upload failed. Please try again.",
        ),
      );
    };

    const form = new FormData();
    form.append(field, file, file.name);
    xhr.send(form);
  });
}
