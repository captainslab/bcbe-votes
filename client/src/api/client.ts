import axios from "axios";

const resolveDefaultApiUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:4000/api";
  }

  return "/api";
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? resolveDefaultApiUrl(),
  timeout: 15000,
});

export const setAdminAuth = (user: string, pass: string) => {
  const token = btoa(`${user}:${pass}`);
  api.defaults.headers.common.Authorization = `Basic ${token}`;
};
