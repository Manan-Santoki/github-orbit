import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { GraphEdge, GraphNode, GraphPayload } from "@github-orbit/core";
import { demoGraph } from "@github-orbit/core/demo";
import { getConfig } from "@github-orbit/config";
import { tokenHash } from "@github-orbit/core/crypto";
import { getPool } from "@github-orbit/db";
import { SharedMapView } from "../../../components/shared-map-view";
export const metadata: Metadata = { title: "Shared map", robots: { index: false, follow: false } };
export default async function SharedMapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (getConfig().DEMO_MODE)
    return (
      <SharedMapView
        graph={demoGraph}
        name="My GitHub orbit"
        description="A private snapshot shared from Orbit."
      />
    );
  const pool = getPool();
  const map = await pool.query<{ id: string; name: string; description: string }>(
    `SELECT m.id,m.name,m.description FROM share_tokens s JOIN saved_maps m ON m.id=s.map_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())`,
    [tokenHash(token)],
  );
  if (!map.rows[0]) notFound();
  const nodes = await pool.query<any>(
    `SELECT gu.id,gu.github_id::text,gu.login,gu.name,gu.bio,gu.avatar_url,gu.followers_count,gu.following_count,n.x,n.y FROM saved_map_nodes n JOIN github_users gu ON gu.id=n.github_user_id WHERE n.map_id=$1`,
    [map.rows[0].id],
  );
  const edges = await pool.query<{ source_user_id: string; target_user_id: string; kind: string }>(
    `SELECT source_user_id,target_user_id,kind FROM saved_map_edges WHERE map_id=$1`,
    [map.rows[0].id],
  );
  const graph: GraphPayload = {
    center: nodes.rows[0]?.id ?? "",
    generatedAt: new Date().toISOString(),
    limits: { maxNodes: 5000, maxEdges: 20000 },
    nodes: nodes.rows.map(
      (n: any) =>
        ({
          id: n.id,
          githubId: n.github_id,
          login: n.login,
          name: n.name ?? undefined,
          bio: n.bio ?? undefined,
          avatarUrl: n.avatar_url,
          kind: "direct",
          relationship: "none",
          languages: [],
          topics: [],
          followers: n.followers_count,
          following: n.following_count,
          coverage: {
            followersLoaded: 0,
            followersTotal: n.followers_count,
            followingLoaded: 0,
            followingTotal: n.following_count,
            truncated: true,
          },
        }) satisfies GraphNode,
    ),
    edges: edges.rows.map(
      (e, i) =>
        ({
          id: `shared-${i}`,
          source: e.source_user_id,
          target: e.target_user_id,
          kind: e.kind === "follow" ? "follow" : "recommendation_path",
        }) satisfies GraphEdge,
    ),
  };
  return (
    <SharedMapView graph={graph} name={map.rows[0].name} description={map.rows[0].description} />
  );
}
