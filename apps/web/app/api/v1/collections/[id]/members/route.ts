import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../../lib/http";

const schema = z.object({
  login: z.string().min(1).max(39),
  note: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    if (!getConfig().DEMO_MODE) {
      await getPool().query(
        `INSERT INTO collection_members (collection_id,github_user_id,position,private_note)
         SELECT c.id,gu.id,coalesce((SELECT max(position)+1 FROM collection_members WHERE collection_id=c.id),0),$4
         FROM collections c JOIN github_users gu ON lower(gu.login)=lower($3)
         WHERE c.id=$2 AND c.owner_account_id=$1
         ON CONFLICT (collection_id,github_user_id) DO UPDATE SET private_note=coalesce(excluded.private_note,collection_members.private_note)`,
        [viewer.accountId, id, body.login, body.note ?? null],
      );
      await getPool().query(
        "UPDATE collections SET updated_at=now() WHERE id=$1 AND owner_account_id=$2",
        [id, viewer.accountId],
      );
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
