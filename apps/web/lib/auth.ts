import { cookies } from "next/headers";
import { getConfig, isAdmin } from "@github-orbit/config";
import { tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";

export type Viewer = {
  accountId: string;
  githubUserId: string;
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  role: "user" | "admin";
  hasFollowPermission: boolean;
};

export const demoViewer: Viewer = {
  accountId: "00000000-0000-4000-8000-000000000001",
  githubUserId: "00000000-0000-4000-8000-000000000002",
  githubId: "10000",
  login: "you",
  name: "Alex Morgan",
  avatarUrl: "https://github.com/identicons/you.png",
  role: "admin",
  hasFollowPermission: false,
};

export async function getViewer(): Promise<Viewer | null> {
  const config = getConfig();
  if (config.DEMO_MODE) return demoViewer;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(config.SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;
  const result = await getPool().query<{
    account_id: string;
    github_user_id: string;
    github_id: string;
    login: string;
    name: string | null;
    avatar_url: string;
    role: "user" | "admin";
    follow_token_encrypted: string | null;
  }>(
    `SELECT a.id AS account_id, gu.id AS github_user_id, gu.github_id::text,
            gu.login, gu.name, gu.avatar_url, a.role, c.follow_token_encrypted
     FROM sessions s
     JOIN accounts a ON a.id = s.account_id
     JOIN github_users gu ON gu.id = a.github_user_id
     JOIN github_oauth_credentials c ON c.account_id = a.id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND a.status = 'active'
     LIMIT 1`,
    [tokenHash(sessionToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  void getPool().query("UPDATE sessions SET last_used_at = now() WHERE token_hash = $1", [
    tokenHash(sessionToken),
  ]);
  return {
    accountId: row.account_id,
    githubUserId: row.github_user_id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role,
    hasFollowPermission: !!row.follow_token_encrypted,
  };
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Response("Unauthorized", { status: 401 });
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin" && !isAdmin(viewer.login)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return viewer;
}

export function safeReturnTo(value: string | null | undefined, fallback = "/explore"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
