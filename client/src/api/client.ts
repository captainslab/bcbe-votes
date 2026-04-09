import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  timeout: 15000,
});

export const setAdminAuth = (user: string, pass: string) => {
  const token = btoa(`${user}:${pass}`);
  api.defaults.headers.common.Authorization = `Basic ${token}`;
};
