import { NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import { requireViewer } from "../../../../lib/auth";
import { apiError, assertSameOrigin, noStoreJson } from "../../../../lib/http";

export async function GET() {
  try {
    const viewer = await requireViewer();
    if (getConfig().DEMO_MODE)
      return noStoreJson({
        items: [
          {
            id: "demo-map",
            name: "My GitHub orbit",
            description: "A snapshot of the demo network",
            version: 1,
            nodeCount: 18,
            updatedAt: new Date().toISOString(),
            shared: true,
          },
        ],
      });
    const result = await getPool().query(
      `SELECT m.id,m.name,m.description,m.version,m.updated_at AS "updatedAt",
              count(DISTINCT n.github_user_id)::int AS "nodeCount",
              bool_or(s.revoked_at IS NULL) AS shared
       FROM saved_maps m LEFT JOIN saved_map_nodes n ON n.map_id=m.id
       LEFT JOIN share_tokens s ON s.map_id=m.id
       WHERE m.owner_account_id=$1 GROUP BY m.id ORDER BY m.updated_at DESC`,
      [viewer.accountId],
    );
    return noStoreJson({ items: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

const mapSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).default(""),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        x: z.number().default(0),
        y: z.number().default(0),
        pinned: z.boolean().default(false),
      }),
    )
    .max(5000),
  edges: z
    .array(z.object({ source: z.string(), target: z.string(), kind: z.string().default("follow") }))
    .max(20000),
  filters: z.record(z.string(), z.unknown()).default({}),
  viewport: z
    .object({ x: z.number(), y: z.number(), ratio: z.number() })
    .default({ x: 0, y: 0, ratio: 1 }),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    const body = mapSchema.parse(await request.json());
    if (getConfig().DEMO_MODE)
      return noStoreJson({ id: `demo-map-${Date.now()}` }, { status: 201 });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const map = await client.query<{ id: string }>(
        `INSERT INTO saved_maps (owner_account_id,name,description,filters,viewport) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [viewer.accountId, body.name, body.description, body.filters, body.viewport],
      );
      const mapId = map.rows[0]!.id;
      for (const node of body.nodes)
        await client.query(
          `INSERT INTO saved_map_nodes (map_id,github_user_id,x,y,pinned) SELECT $1,id,$3,$4,$5 FROM github_users WHERE id=$2`,
          [mapId, node.id, node.x, node.y, node.pinned],
        );
      for (const edge of body.edges)
        await client.query(
          `INSERT INTO saved_map_edges (map_id,source_user_id,target_user_id,kind) SELECT $1,s.id,t.id,$4 FROM github_users s,github_users t WHERE s.id=$2 AND t.id=$3 ON CONFLICT DO NOTHING`,
          [mapId, edge.source, edge.target, edge.kind],
        );
      await client.query("COMMIT");
      return noStoreJson({ id: mapId }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return apiError(error);
  }
}
