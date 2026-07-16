import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "@github-orbit/config";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getConfig().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!database) database = drizzle(getPool(), { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}

export { schema };
export * from "./schema";
