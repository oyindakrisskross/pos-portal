import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

const ACCESS_KEY = "kk_pos_access";
const REFRESH_KEY = "kk_pos_refresh";

// Security: POS sessions should not persist after closing the window/tab.
// Use sessionStorage (cleared when the tab/window is closed) instead of localStorage.
try {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
} catch {
  // ignore (e.g. blocked storage)
}

let accessToken: string | null = sessionStorage.getItem(ACCESS_KEY) || null;
let refreshToken: string | null = sessionStorage.getItem(REFRESH_KEY) || null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
  if (t) sessionStorage.setItem(ACCESS_KEY, t);
  else sessionStorage.removeItem(ACCESS_KEY);
};

export const setRefreshToken = (t: string | null) => {
  refreshToken = t;
  if (t) sessionStorage.setItem(REFRESH_KEY, t);
  else sessionStorage.removeItem(REFRESH_KEY);
};

api.interceptors.request.use((config) => {
  const url = config.url ?? "";

  // Skip attaching JWT to login & refresh requests
  if (
    url.includes("/api/auth/login") ||
    url.includes("/api/auth/refresh")
  ) {
    return config;
  }

  // Otherwise attach access token
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  
  return config;
});

// Auto-refresh on 401 using the refresh token
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest: any = error.config || {};

    const url = originalRequest.url ?? "";

    if (
      status === 401 &&
      !originalRequest._retry &&
      !url.includes("/api/auth/login") &&
      !url.includes("/api/auth/refresh")
    ) {
      // no refresh token – just fail and let app log out
      if (!refreshToken) {
        setAccessToken(null);
        setRefreshToken(null);
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // de‑dupe concurrent refreshes
      if (!refreshPromise) {
        refreshPromise = api
          .post("/api/auth/refresh", { refresh: refreshToken })
          .then((res) => {
            const newAccess = (res.data as any).access as string;
            setAccessToken(newAccess);
            return newAccess;
          })
          .catch((err) => {
            // refresh failed (expired/invalid) -> clear tokens
            setAccessToken(null);
            setRefreshToken(null);
            throw err;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newAccess = await refreshPromise;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
