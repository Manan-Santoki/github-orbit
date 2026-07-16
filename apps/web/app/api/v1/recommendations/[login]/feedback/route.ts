import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../../lib/http";

const bodySchema = z.object({
  action: z.enum(["open", "save", "follow", "dismiss", "less_like_this"]),
  reason: z.string().max(120).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ login: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const { login } = await context.params;
    const body = bodySchema.parse(await request.json());
    if (!getConfig().DEMO_MODE) {
      await getPool().query(
        `INSERT INTO recommendation_feedback (viewer_account_id,candidate_user_id,action,reason)
         SELECT $1,id,$3,$4 FROM github_users WHERE lower(login)=lower($2)`,
        [viewer.accountId, login, body.action, body.reason ?? null],
      );
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
