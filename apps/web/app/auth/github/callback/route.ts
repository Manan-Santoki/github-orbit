import { NextRequest, NextResponse } from "next/server";
import { getConfig, isAdmin } from "@github-orbit/config";
import { encryptSecret, randomToken, tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { exchangeGitHubCode, GitHubClient } from "@github-orbit/integrations/github";
import { addOrbitJob, getRedisConnection } from "@github-orbit/queues";
import { safeReturnTo } from "../../../../lib/auth";

type OAuthState = {
  intent: "signin" | "follow";
  verifier: string;
  returnTo: string;
  accountId?: string;
};

export async function GET(request: NextRequest) {
  const config = getConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || request.cookies.get("orbit_oauth_state")?.value !== tokenHash(state)) {
    return NextResponse.redirect(new URL("/?authError=invalid_state", request.url));
  }
  const key = `oauth:${tokenHash(state)}`;
  const raw = await getRedisConnection().getdel(key);
  if (!raw) return NextResponse.redirect(new URL("/?authError=expired_state", request.url));
  const oauth = JSON.parse(raw) as OAuthState;
  const { accessToken, scopes } = await exchangeGitHubCode(code, oauth.verifier);
  const profile = (await new GitHubClient(accessToken).getViewer()).data;
  if (!config.TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const encrypted = encryptSecret(accessToken, config.TOKEN_ENCRYPTION_KEY);
  const pool = getPool();

  if (oauth.intent === "follow") {
    const account = await pool.query<{ github_id: string }>(
      `SELECT gu.github_id::text FROM accounts a JOIN github_users gu ON gu.id = a.github_user_id WHERE a.id = $1`,
      [oauth.accountId],
    );
    if (
      !account.rows[0] ||
      account.rows[0].github_id !== String(profile.id) ||
      !scopes.includes("user:follow")
    ) {
      return NextResponse.redirect(
        new URL(`${safeReturnTo(oauth.returnTo)}?permission=denied`, request.url),
      );
    }
    await pool.query(
      `UPDATE github_oauth_credentials SET follow_token_encrypted = $2, follow_scopes = $3, token_updated_at = now() WHERE account_id = $1`,
      [oauth.accountId, encrypted, scopes],
    );
    await pool.query(
      `INSERT INTO audit_events (account_id, action, subject) VALUES ($1, 'github.follow_permission_granted', $2)`,
      [oauth.accountId, profile.login],
    );
    return NextResponse.redirect(new URL(safeReturnTo(oauth.returnTo), request.url));
  }

  const invited = await pool.query(
    `SELECT 1 FROM invites WHERE lower(github_login) = lower($1) AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
    [profile.login],
  );
  const existingAccount = await pool.query<{ id: string }>(
    `SELECT a.id FROM accounts a
     JOIN github_users gu ON gu.id=a.github_user_id
     WHERE gu.github_id=$1 LIMIT 1`,
    [profile.id],
  );
  const accountCount = config.PERSONAL_MODE
    ? await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM accounts")
    : null;
  const bootstrapPersonalAccount =
    config.PERSONAL_MODE && Number(accountCount?.rows[0]?.count ?? 0) === 0;
  if (
    !invited.rowCount &&
    !existingAccount.rowCount &&
    !isAdmin(profile.login) &&
    !bootstrapPersonalAccount
  ) {
    return NextResponse.redirect(new URL("/?authError=not_invited", request.url));
  }

  const client = await pool.connect();
  let accountId: string;
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `INSERT INTO github_users
         (github_id, node_id, login, name, bio, company, location, avatar_url, html_url, account_type,
          is_bot, followers_count, following_count, public_repos_count, profile_updated_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
       ON CONFLICT (github_id) DO UPDATE SET
         login=excluded.login, name=excluded.name, bio=excluded.bio, company=excluded.company,
         location=excluded.location, avatar_url=excluded.avatar_url, html_url=excluded.html_url,
         followers_count=excluded.followers_count, following_count=excluded.following_count,
         public_repos_count=excluded.public_repos_count, profile_updated_at=excluded.profile_updated_at,
         updated_at=now()
       RETURNING id`,
      [
        profile.id,
        profile.node_id,
        profile.login,
        profile.name,
        profile.bio,
        profile.company,
        profile.location,
        profile.avatar_url,
        profile.html_url,
        profile.type,
        profile.type === "Bot",
        profile.followers,
        profile.following,
        profile.public_repos,
        profile.updated_at,
      ],
    );
    const account = await client.query<{ id: string }>(
      `INSERT INTO accounts (github_user_id, role) VALUES ($1,$2)
       ON CONFLICT (github_user_id) DO UPDATE SET last_active_at=now(), status='active'
       RETURNING id`,
      [user.rows[0]?.id, isAdmin(profile.login) || bootstrapPersonalAccount ? "admin" : "user"],
    );
    accountId = account.rows[0]!.id;
    await client.query(
      `INSERT INTO github_oauth_credentials (account_id, read_token_encrypted, read_scopes)
       VALUES ($1,$2,$3)
       ON CONFLICT (account_id) DO UPDATE SET read_token_encrypted=excluded.read_token_encrypted,
         read_scopes=excluded.read_scopes, token_updated_at=now()`,
      [accountId, encrypted, scopes],
    );
    await client.query(
      "UPDATE invites SET redeemed_at=coalesce(redeemed_at,now()) WHERE lower(github_login)=lower($1)",
      [profile.login],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  await pool.query("INSERT INTO sessions (account_id, token_hash, expires_at) VALUES ($1,$2,$3)", [
    accountId,
    tokenHash(sessionToken),
    expiresAt,
  ]);
  const sync = await pool.query<{ id: string }>(
    "INSERT INTO sync_runs (account_id,type) VALUES ($1,'initial') RETURNING id",
    [accountId],
  );
  await addOrbitJob(
    { name: "sync-account", data: { accountId, syncRunId: sync.rows[0]!.id } },
    { jobId: `sync-${accountId}-${sync.rows[0]!.id}` },
  );
  const response = NextResponse.redirect(new URL("/explore?welcome=1", request.url));
  response.cookies.set(config.SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.delete("orbit_oauth_state");
  return response;
}
