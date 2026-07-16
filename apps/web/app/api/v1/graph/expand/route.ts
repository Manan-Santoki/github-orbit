import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { addOrbitJob } from "@github-orbit/queues";
import { requireViewer } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../../lib/http";

const bodySchema = z.object({
  login: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9-]+$/),
  direction: z.enum(["followers", "following", "both"]).default("both"),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const body = bodySchema.parse(await request.json());
    if (getConfig().DEMO_MODE) return noStoreJson({ status: "completed", demo: true });
    const active = await getPool().query<{ id: string; status: string }>(
      `SELECT id,status::text FROM sync_runs
       WHERE account_id=$1 AND type=$2 AND status IN ('queued','running','waiting_rate_limit')
       ORDER BY created_at DESC LIMIT 1`,
      [viewer.accountId, `expand:${body.login}:${body.direction}`],
    );
    if (active.rows[0]) {
      return noStoreJson(
        {
          status: active.rows[0].status,
          syncRunId: active.rows[0].id,
          existing: true,
        },
        { status: 202 },
      );
    }
    const run = await getPool().query<{ id: string }>(
      "INSERT INTO sync_runs (account_id,type) VALUES ($1,$2) RETURNING id",
      [viewer.accountId, `expand:${body.login}:${body.direction}`],
    );
    const syncRunId = run.rows[0]!.id;
    const jobId = await addOrbitJob({
      name: "expand-user",
      data: {
        accountId: viewer.accountId,
        login: body.login,
        direction: body.direction,
        syncRunId,
      },
    });
    return noStoreJson({ status: "queued", syncRunId, jobId }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
