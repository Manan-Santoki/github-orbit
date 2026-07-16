import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { demoCollections } from "@github-orbit/core/demo";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../lib/http";

export async function GET() {
  try {
    const viewer = await requireViewer();
    if (getConfig().DEMO_MODE) return noStoreJson({ items: demoCollections });
    const result = await getPool().query(
      `SELECT c.id,c.name,c.description,c.updated_at AS "updatedAt",count(cm.github_user_id)::int AS "memberCount"
       FROM collections c LEFT JOIN collection_members cm ON cm.collection_id=c.id
       WHERE c.owner_account_id=$1 GROUP BY c.id ORDER BY c.updated_at DESC`,
      [viewer.accountId],
    );
    return noStoreJson({ items: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const body = createSchema.parse(await request.json());
    if (getConfig().DEMO_MODE)
      return noStoreJson(
        { id: `demo-${Date.now()}`, ...body, memberCount: 0, updatedAt: new Date().toISOString() },
        { status: 201 },
      );
    const result = await getPool().query(
      `INSERT INTO collections (owner_account_id,name,description) VALUES ($1,$2,$3)
       RETURNING id,name,description,0 AS "memberCount",updated_at AS "updatedAt"`,
      [viewer.accountId, body.name, body.description],
    );
    return noStoreJson(result.rows[0], { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
