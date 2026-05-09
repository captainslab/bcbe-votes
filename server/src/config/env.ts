import path from "path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { z } from "zod";

const loadEnv = (filePath: string) => {
  const result = dotenv.config({ path: filePath });
  if (result.parsed) {
    dotenvExpand.expand(result);
  }
};

// Load .env files from server root and repository root (if present)
const serverEnvPath = path.resolve(process.cwd(), ".env");
const repoEnvPath = path.resolve(process.cwd(), "..", ".env");
loadEnv(serverEnvPath);
if (repoEnvPath !== serverEnvPath) {
  loadEnv(repoEnvPath);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RATE_LIMIT_WINDOW_MINUTES: z.string().default("15"),
  RATE_LIMIT_MAX: z.string().default("300"),
  ADMIN_BASIC_USER: z.string().default(""),
  ADMIN_BASIC_PASS: z.string().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_REQUEST_LOGS: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  port: Number(env.PORT),
  databaseUrl: env.DATABASE_URL,
  corsOrigin: env.CORS_ORIGIN,
  rateLimit: {
    windowMs: Number(env.RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000,
    max: Number(env.RATE_LIMIT_MAX),
  },
  admin: {
    user: env.ADMIN_BASIC_USER,
    pass: env.ADMIN_BASIC_PASS,
  },
  logLevel: env.LOG_LEVEL,
  enableRequestLogs: env.ENABLE_REQUEST_LOGS === "true",
};

export type AppConfig = typeof config;
