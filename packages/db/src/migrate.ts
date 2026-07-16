import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPool, closeDb } from "./index";

const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));
const pool = getPool();

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orbit_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const existing = await pool.query<{ name: string }>(
      "SELECT name FROM orbit_migrations WHERE name = $1",
      [file],
    );
    if (existing.rowCount) continue;

    const sql = await readFile(`${migrationsDirectory}/${file}`, "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO orbit_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${file}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await closeDb();
}
