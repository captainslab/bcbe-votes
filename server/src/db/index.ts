import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config/env";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.env === "production" ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
