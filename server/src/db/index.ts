import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config/env";
import * as schema from "./schema";

const usesLocalDatabase =
  config.databaseUrl.includes("host=/var/run/postgresql") ||
  config.databaseUrl.includes("@localhost") ||
  config.databaseUrl.includes("@127.0.0.1") ||
  config.databaseUrl.includes("localhost:") ||
  config.databaseUrl.includes("127.0.0.1:");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.env === "production" && !usesLocalDatabase ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
