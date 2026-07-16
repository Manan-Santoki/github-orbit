import { NextRequest } from "next/server";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { addOrbitJob } from "@github-orbit/queues";
import { requireViewer } from "../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../lib/http";

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    if (getConfig().DEMO_MODE)
      return noStoreJson({
        id: "demo-sync",
        status: "completed",
        stage: "completed",
        progress: { followers: { loaded: 184 }, following: { loaded: 96 } },
        createdAt: new Date().toISOString(),
      });
    const runId = request.nextUrl.searchParams.get("runId");
    if (runId && !/^[0-9a-f-]{36}$/i.test(runId)) {
      return noStoreJson({ error: "Invalid sync run" }, { status: 400 });
    }
    const result = await getPool().query(
      `SELECT id,type,status,stage,progress,error_code AS "errorCode",error_message AS "errorMessage",rate_limit_reset_at AS "rateLimitResetAt",created_at AS "createdAt",completed_at AS "completedAt"
       FROM sync_runs
       WHERE account_id=$1 ${runId ? "AND id=$2" : ""}
       ORDER BY created_at DESC LIMIT 1`,
      runId ? [viewer.accountId, runId] : [viewer.accountId],
    );
    return noStoreJson(result.rows[0] ?? null);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    if (getConfig().DEMO_MODE) return noStoreJson({ status: "completed", demo: true });
    const recent = await getPool().query(
      `SELECT 1 FROM sync_runs WHERE account_id=$1 AND type IN ('initial','manual') AND created_at>now()-interval '1 hour' LIMIT 1`,
      [viewer.accountId],
    );
    if (recent.rowCount)
      return noStoreJson(
        { error: "Your network was refreshed within the last hour" },
        { status: 429 },
      );
    const run = await getPool().query<{ id: string }>(
      `INSERT INTO sync_runs (account_id,type) VALUES ($1,'manual') RETURNING id`,
      [viewer.accountId],
    );
    const syncRunId = run.rows[0]!.id;
    await addOrbitJob(
      { name: "sync-account", data: { accountId: viewer.accountId, syncRunId } },
      { jobId: `sync-${viewer.accountId}-${syncRunId}` },
    );
    return noStoreJson({ status: "queued", syncRunId }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
