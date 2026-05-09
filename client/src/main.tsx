import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient();

function injectCloudflareWebAnalytics() {
  if (!import.meta.env.PROD) return;

  const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN?.trim();
  if (!token) return;
  if (document.querySelector('script[data-cf-beacon]')) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token, spa: true }));
  document.head.appendChild(script);
}

injectCloudflareWebAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
