import { NextRequest } from "next/server";
import { getConfig } from "@github-orbit/config";
import { tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../lib/http";

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const config = getConfig();
    if (!config.DEMO_MODE) {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO audit_events (account_id,action,subject) VALUES ($1,'account.deleted',$2)`,
          [viewer.accountId, viewer.login],
        );
        await client.query("DELETE FROM accounts WHERE id=$1", [viewer.accountId]);
        await client.query(
          `DELETE FROM github_users
           WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM accounts WHERE github_user_id=$1)`,
          [viewer.githubUserId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    const response = noStoreJson({ ok: true });
    const token = request.cookies.get(config.SESSION_COOKIE_NAME)?.value;
    if (token && !config.DEMO_MODE)
      await getPool().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
    response.cookies.delete(config.SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
