import { getPool, closeDb } from "./index";

const login = process.argv[2];
if (!login) {
  process.stderr.write("Usage: pnpm db:seed <github-login>\n");
  process.exitCode = 1;
} else {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO invites (github_login) VALUES (lower($1))
       ON CONFLICT ((lower(github_login))) DO UPDATE SET revoked_at = NULL, expires_at = NULL`,
      [login],
    );
    process.stdout.write(`Invited ${login}\n`);
  } finally {
    await closeDb();
  }
}
