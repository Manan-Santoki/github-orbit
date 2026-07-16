export type Relationship = "self" | "following" | "follower" | "mutual" | "none";
export type NodeKind = "viewer" | "direct" | "second_hop" | "recommended";

export type GraphNode = {
  id: string;
  githubId: string;
  login: string;
  name?: string;
  bio?: string;
  avatarUrl: string;
  kind: NodeKind;
  relationship: Relationship;
  clusterId?: string;
  languages: string[];
  topics: string[];
  followers: number;
  following: number;
  activityAt?: string;
  score?: number;
  coverage: {
    followersLoaded: number;
    followersTotal: number;
    followingLoaded: number;
    followingTotal: number;
    truncated: boolean;
  };
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "follow" | "recommendation_path";
  observedAt?: string;
};

export type GraphPayload = {
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  limits: { maxNodes: number; maxEdges: number };
};

export type RecommendationReason = {
  type: "network" | "semantic" | "topics" | "languages" | "activity" | "explore";
  label: string;
  contribution: number;
};

export type Recommendation = {
  candidate: GraphNode;
  score: number;
  rank: number;
  reasons: RecommendationReason[];
  sharedTopics: string[];
  sharedLanguages: string[];
};

export type CollectionSummary = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  updatedAt: string;
};

export function relationshipFor(
  viewerId: string,
  targetId: string,
  edges: Pick<GraphEdge, "source" | "target" | "kind">[],
): Relationship {
  if (viewerId === targetId) return "self";
  const following = edges.some(
    (edge) => edge.kind === "follow" && edge.source === viewerId && edge.target === targetId,
  );
  const follower = edges.some(
    (edge) => edge.kind === "follow" && edge.source === targetId && edge.target === viewerId,
  );
  if (following && follower) return "mutual";
  if (following) return "following";
  if (follower) return "follower";
  return "none";
}
