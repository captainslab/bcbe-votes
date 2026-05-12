import axios from "axios";

const resolveDefaultApiUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:4000/api";
  }

  return "/api";
};

// Extract board slug at module level (not in a hook)
function getBoardSlug(): string | null {
  const hostname = window.location.hostname;
  const match = hostname.match(/^([^.]+)\.boardvotes\.io$/);
  const devBoard = new URLSearchParams(window.location.search).get("board");
  return match?.[1] ?? devBoard ?? null;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? resolveDefaultApiUrl(),
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const slug = getBoardSlug();
  if (slug) config.headers["X-Board-Slug"] = slug;
  return config;
});

export const setAdminAuth = (user: string, pass: string) => {
  const token = btoa(`${user}:${pass}`);
  api.defaults.headers.common.Authorization = `Basic ${token}`;
};
