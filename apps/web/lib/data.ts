import type { GraphEdge, GraphNode, GraphPayload, Recommendation } from "@github-orbit/core";
import { relationshipFor } from "@github-orbit/core";
import { demoGraph, demoRecommendations } from "@github-orbit/core/demo";
import { getConfig } from "@github-orbit/config";
import { getPool } from "@github-orbit/db";
import type { Viewer } from "./auth";

type GraphRow = {
  id: string;
  github_id: string;
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  followers_count: number;
  following_count: number;
  activity_at: Date | null;
  topics: string[] | null;
  languages: Record<string, number> | null;
  depth: number;
};

const GRAPH_NODE_LIMIT = 10_000;
const GRAPH_EDGE_LIMIT = 40_000;

export async function loadGraph(viewer: Viewer): Promise<GraphPayload> {
  if (getConfig().DEMO_MODE) return demoGraph;
  const pool = getPool();
  const rows = await pool.query<GraphRow>(
    `WITH direct AS (
       SELECT CASE WHEN source_user_id=$1 THEN target_user_id ELSE source_user_id END AS id, 1 AS depth
       FROM follow_edges WHERE source_user_id=$1 OR target_user_id=$1
     ), second_hop AS (
       SELECT DISTINCT CASE WHEN fe.source_user_id=d.id THEN fe.target_user_id ELSE fe.source_user_id END AS id, 2 AS depth
       FROM direct d JOIN follow_edges fe ON fe.source_user_id=d.id OR fe.target_user_id=d.id
       WHERE fe.source_user_id<>$1 AND fe.target_user_id<>$1
       LIMIT 9500
     ), selected AS (
       SELECT $1::uuid AS id, 0 AS depth
       UNION SELECT id, min(depth) FROM direct GROUP BY id
       UNION SELECT id, min(depth) FROM second_hop GROUP BY id
     )
     SELECT gu.id, gu.github_id::text, gu.login, gu.name, gu.bio, gu.avatar_url,
            gu.followers_count, gu.following_count, gu.activity_at,
            coalesce(uf.topics,'{}') AS topics, coalesce(uf.languages,'{}'::jsonb) AS languages,
            min(s.depth)::int AS depth
     FROM selected s JOIN github_users gu ON gu.id=s.id
     LEFT JOIN user_features uf ON uf.github_user_id=gu.id
     GROUP BY gu.id, uf.topics, uf.languages
     ORDER BY min(s.depth), gu.followers_count DESC
     LIMIT ${GRAPH_NODE_LIMIT}`,
    [viewer.githubUserId],
  );
  const coverageKeys = rows.rows.flatMap((row) => [
    `users/${row.login}/followers`,
    `users/${row.login}/following`,
  ]);
  const coverageRows = coverageKeys.length
    ? await pool.query<{
        resource_key: string;
        loaded_count: number;
        complete: boolean;
      }>(
        `SELECT resource_key,loaded_count,complete
         FROM github_fetch_state WHERE resource_key=ANY($1::text[])`,
        [coverageKeys],
      )
    : { rows: [] };
  const coverageByKey = new Map(coverageRows.rows.map((row) => [row.resource_key, row]));
  const ids = rows.rows.map((row) => row.id);
  const edgeRows = ids.length
    ? await pool.query<{ source_user_id: string; target_user_id: string; last_observed_at: Date }>(
        `SELECT source_user_id, target_user_id, last_observed_at FROM follow_edges
         WHERE source_user_id=ANY($1::uuid[]) AND target_user_id=ANY($1::uuid[])
         LIMIT ${GRAPH_EDGE_LIMIT}`,
        [ids],
      )
    : { rows: [] };
  const edges: GraphEdge[] = edgeRows.rows.map((edge) => ({
    id: `${edge.source_user_id}:${edge.target_user_id}`,
    source: edge.source_user_id,
    target: edge.target_user_id,
    kind: "follow",
    observedAt: edge.last_observed_at.toISOString(),
  }));
  const nodes: GraphNode[] = rows.rows.map((row) => {
    const relationship = relationshipFor(viewer.githubUserId, row.id, edges);
    const followersCoverage = coverageByKey.get(`users/${row.login}/followers`);
    const followingCoverage = coverageByKey.get(`users/${row.login}/following`);
    const followersLoaded = Math.min(followersCoverage?.loaded_count ?? 0, row.followers_count);
    const followingLoaded = Math.min(followingCoverage?.loaded_count ?? 0, row.following_count);
    return {
      id: row.id,
      githubId: row.github_id,
      login: row.login,
      ...(row.name ? { name: row.name } : {}),
      ...(row.bio ? { bio: row.bio } : {}),
      avatarUrl: row.avatar_url,
      kind: row.depth === 0 ? "viewer" : row.depth === 1 ? "direct" : "second_hop",
      relationship,
      languages: Object.keys(row.languages ?? {}).slice(0, 8),
      topics: (row.topics ?? []).slice(0, 12),
      followers: row.followers_count,
      following: row.following_count,
      ...(row.activity_at ? { activityAt: row.activity_at.toISOString() } : {}),
      coverage: {
        followersLoaded,
        followersTotal: row.followers_count,
        followingLoaded,
        followingTotal: row.following_count,
        truncated: followersLoaded < row.followers_count || followingLoaded < row.following_count,
      },
    };
  });
  return {
    center: viewer.githubUserId,
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    limits: { maxNodes: GRAPH_NODE_LIMIT, maxEdges: GRAPH_EDGE_LIMIT },
  };
}

export async function loadRecommendations(viewer: Viewer): Promise<Recommendation[]> {
  if (getConfig().DEMO_MODE) return demoRecommendations;
  const result = await getPool().query<{
    score: number;
    rank: number;
    reasons: Recommendation["reasons"];
    id: string;
    github_id: string;
    login: string;
    name: string | null;
    bio: string | null;
    avatar_url: string;
    followers_count: number;
    following_count: number;
    activity_at: Date | null;
    topics: string[] | null;
    languages: Record<string, number> | null;
  }>(
    `SELECT r.score, r.rank, r.reasons, gu.id, gu.github_id::text, gu.login, gu.name, gu.bio,
            gu.avatar_url, gu.followers_count, gu.following_count, gu.activity_at,
            uf.topics, uf.languages
     FROM recommendations r JOIN github_users gu ON gu.id=r.candidate_user_id
     LEFT JOIN user_features uf ON uf.github_user_id=gu.id
     WHERE r.viewer_account_id=$1 AND r.expires_at>now()
       AND NOT EXISTS (
         SELECT 1 FROM recommendation_feedback f
         WHERE f.viewer_account_id=$1 AND f.candidate_user_id=gu.id
           AND f.action='dismiss' AND f.created_at>now()-interval '90 days'
       )
     ORDER BY r.rank LIMIT 100`,
    [viewer.accountId],
  );
  return result.rows.map((row) => ({
    candidate: {
      id: row.id,
      githubId: row.github_id,
      login: row.login,
      ...(row.name ? { name: row.name } : {}),
      ...(row.bio ? { bio: row.bio } : {}),
      avatarUrl: row.avatar_url,
      kind: "recommended",
      relationship: "none",
      languages: Object.keys(row.languages ?? {}),
      topics: row.topics ?? [],
      followers: row.followers_count,
      following: row.following_count,
      ...(row.activity_at ? { activityAt: row.activity_at.toISOString() } : {}),
      score: row.score,
      coverage: {
        followersLoaded: 0,
        followersTotal: row.followers_count,
        followingLoaded: 0,
        followingTotal: row.following_count,
        truncated: true,
      },
    },
    score: row.score,
    rank: row.rank,
    reasons: row.reasons,
    sharedTopics: (row.topics ?? []).slice(0, 3),
    sharedLanguages: Object.keys(row.languages ?? {}).slice(0, 3),
  }));
}
