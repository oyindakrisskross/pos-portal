import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

let accessToken: string | null = localStorage.getItem("kk_pos_access") || null;
let refreshToken: string | null = localStorage.getItem("kk_pos_refresh") || null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
  if (t) localStorage.setItem("kk_pos_access", t);
  else localStorage.removeItem("kk_pos_access");
};

export const setRefreshToken = (t: string | null) => {
  refreshToken = t;
  if (t) localStorage.setItem("kk_pos_refresh", t);
  else localStorage.removeItem("kk_pos_refresh");
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
