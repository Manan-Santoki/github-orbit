import { NextRequest } from "next/server";
import { getConfig } from "@github-orbit/config";
import { randomToken, tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../../lib/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const { id } = await context.params;
    const token = randomToken();
    if (!getConfig().DEMO_MODE) {
      const result = await getPool().query(
        `INSERT INTO share_tokens (map_id,token_hash,map_version) SELECT id,$3,version FROM saved_maps WHERE id=$2 AND owner_account_id=$1 RETURNING id`,
        [viewer.accountId, id, tokenHash(token)],
      );
      if (!result.rowCount) throw new Response("Not found", { status: 404 });
    }
    return noStoreJson({ url: `${getConfig().APP_URL}/s/${token}` }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const { id } = await context.params;
    if (!getConfig().DEMO_MODE)
      await getPool().query(
        `UPDATE share_tokens SET revoked_at=now() WHERE map_id IN (SELECT id FROM saved_maps WHERE id=$2 AND owner_account_id=$1)`,
        [viewer.accountId, id],
      );
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
