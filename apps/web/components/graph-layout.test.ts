import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, GraphPayload } from "@github-orbit/core";
import { buildStableGraphLayout } from "./graph-layout";

function node(id: string, kind: GraphNode["kind"]): GraphNode {
  return {
    id,
    githubId: id,
    login: id,
    avatarUrl: `https://example.com/${id}.png`,
    kind,
    relationship: kind === "viewer" ? "self" : kind === "direct" ? "following" : "none",
    languages: [],
    topics: [],
    followers: 0,
    following: 0,
    coverage: {
      followersLoaded: 0,
      followersTotal: 0,
      followingLoaded: 0,
      followingTotal: 0,
      truncated: false,
    },
  };
}

function edge(id: string, source: string, target: string): GraphEdge {
  return {
    id,
    source,
    target,
    kind: "follow",
    observedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("buildStableGraphLayout", () => {
  it("keeps positions deterministic and separates follower and following lobes", () => {
    const payload: GraphPayload = {
      center: "viewer",
      nodes: [
        node("viewer", "viewer"),
        node("parent", "direct"),
        node("follower", "second_hop"),
        node("following", "second_hop"),
      ],
      edges: [
        edge("viewer-parent", "viewer", "parent"),
        edge("follower-parent", "follower", "parent"),
        edge("parent-following", "parent", "following"),
      ],
      generatedAt: "2026-07-15T00:00:00.000Z",
      limits: { maxNodes: 10_000, maxEdges: 40_000 },
    };

    const first = buildStableGraphLayout(payload, new Map());
    const second = buildStableGraphLayout(payload, new Map());
    expect([...first]).toEqual([...second]);
    expect(first.get("viewer")).toEqual({ x: 0, y: 0 });

    const parent = first.get("parent")!;
    const follower = first.get("follower")!;
    const following = first.get("following")!;
    const length = Math.hypot(parent.x, parent.y);
    const perpendicular = { x: -parent.y / length, y: parent.x / length };
    const followerSide =
      (follower.x - parent.x) * perpendicular.x + (follower.y - parent.y) * perpendicular.y;
    const followingSide =
      (following.x - parent.x) * perpendicular.x + (following.y - parent.y) * perpendicular.y;
    expect(followerSide).toBeGreaterThan(0);
    expect(followingSide).toBeLessThan(0);
  });
});
