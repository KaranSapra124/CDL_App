import { getAuth, clearAuth } from "./auth";

const BASE_URL = import.meta.env.VITE_API_URL;

let activeRequests = 0;

const notifyLoading = () => {
  window.dispatchEvent(
    new CustomEvent("app-loading", { detail: { active: activeRequests } })
  );
};

const trackRequest = async (fn) => {
  activeRequests += 1;
  notifyLoading();
  try {
    return await fn();
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    notifyLoading();
  }
};

export async function apiFetch(path, options = {}) {
  const { token } = getAuth();

  return trackRequest(async () => {
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
  });
}

export async function apiUpload(path, formData) {
  const { token } = getAuth();

  return trackRequest(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && token) {
      clearAuth();
      window.location.href = "/login";
    }

    if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
    return data;
  });
}

export async function apiDownload(path, filename) {
  const { token } = getAuth();

  return trackRequest(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.status === 401 && token) {
      clearAuth();
      window.location.href = "/login";
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Download failed: ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}
