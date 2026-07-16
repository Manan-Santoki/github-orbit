import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { requireAdmin } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../lib/http";

export async function GET() {
  try {
    await requireAdmin();
    if (getConfig().DEMO_MODE)
      return noStoreJson({
        items: [
          {
            id: "demo-invite",
            githubLogin: "octocat",
            createdAt: new Date().toISOString(),
            redeemedAt: null,
            revokedAt: null,
          },
        ],
      });
    const result = await getPool().query(
      `SELECT id,github_login AS "githubLogin",created_at AS "createdAt",redeemed_at AS "redeemedAt",revoked_at AS "revokedAt",expires_at AS "expiresAt" FROM invites ORDER BY created_at DESC`,
    );
    return noStoreJson({ items: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { login } = z
      .object({
        login: z
          .string()
          .min(1)
          .max(39)
          .regex(/^[a-zA-Z0-9-]+$/),
      })
      .parse(await request.json());
    if (getConfig().DEMO_MODE)
      return noStoreJson({ id: `demo-${Date.now()}`, githubLogin: login }, { status: 201 });
    const result = await getPool().query(
      `INSERT INTO invites (github_login,created_by_account_id) VALUES (lower($1),$2) ON CONFLICT ((lower(github_login))) DO UPDATE SET revoked_at=NULL,expires_at=NULL RETURNING id,github_login AS "githubLogin"`,
      [login, admin.accountId],
    );
    return noStoreJson(result.rows[0], { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
