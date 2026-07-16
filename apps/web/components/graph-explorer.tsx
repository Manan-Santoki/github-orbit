"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Filter,
  Focus,
  GitFork,
  List,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import type { GraphNode, GraphPayload, Relationship } from "@github-orbit/core";

const relationshipColors: Record<Relationship, string> = {
  self: "#85f0ca",
  following: "#71a7ff",
  follower: "#b392ff",
  mutual: "#f3c768",
  none: "#77839a",
};

async function fetchGraph(): Promise<GraphPayload> {
  const response = await fetch("/api/v1/graph", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load your graph");
  return response.json() as Promise<GraphPayload>;
}

type SyncState = {
  status: "queued" | "running" | "waiting_rate_limit" | "completed" | "failed";
  stage: string;
  errorMessage?: string | null;
};

async function waitForExpansion(syncRunId: string): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await fetch(`/api/v1/sync?runId=${encodeURIComponent(syncRunId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to read expansion progress");
    const state = (await response.json()) as SyncState | null;
    if (state?.status === "completed") return;
    if (state?.status === "failed") {
      throw new Error(state.errorMessage ?? "GitHub network expansion failed");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error("Expansion is still running. Refresh the graph in a moment.");
}

export const GraphCanvas = dynamic(
  () => import("./graph-canvas").then((module) => module.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="graph-loading">
        <span className="loading-orbit" />
        <p>Preparing the infinite canvas…</p>
      </div>
    ),
  },
);

function ProfileDrawer({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const networkComplete = !node.coverage.truncated;
  const expand = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/graph/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: node.login, direction: "both" }),
      });
      const result = (await response.json()) as {
        status?: string;
        syncRunId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Expansion failed");
      if (result.syncRunId) await waitForExpansion(result.syncRunId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
  return (
    <aside className="profile-drawer" aria-label={`${node.login} profile details`}>
      <button className="drawer-close icon-button" onClick={onClose} aria-label="Close profile">
        <X size={17} />
      </button>
      <div className="drawer-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.avatarUrl} alt="" />
        <span className={`relationship-badge ${node.relationship}`}>
          {node.relationship.replace("_", " ")}
        </span>
        <h2>{node.name ?? node.login}</h2>
        <p className="handle">@{node.login}</p>
        <p className="bio">{node.bio ?? "No public bio yet."}</p>
      </div>
      <div className="profile-stats">
        <div>
          <strong>{node.followers.toLocaleString()}</strong>
          <span>Followers</span>
        </div>
        <div>
          <strong>{node.following.toLocaleString()}</strong>
          <span>Following</span>
        </div>
        <div>
          <strong>{node.coverage.truncated ? "Partial" : "Full"}</strong>
          <span>Coverage</span>
        </div>
      </div>
      <div className="coverage-detail">
        <div>
          <span>Followers loaded</span>
          <strong>
            {node.coverage.followersLoaded.toLocaleString()} /{" "}
            {node.coverage.followersTotal.toLocaleString()}
          </strong>
        </div>
        <div className="coverage-track">
          <i
            style={{
              width: `${node.coverage.followersTotal === 0 ? 100 : Math.min(100, (node.coverage.followersLoaded / node.coverage.followersTotal) * 100)}%`,
            }}
          />
        </div>
        <div>
          <span>Following loaded</span>
          <strong>
            {node.coverage.followingLoaded.toLocaleString()} /{" "}
            {node.coverage.followingTotal.toLocaleString()}
          </strong>
        </div>
        <div className="coverage-track">
          <i
            style={{
              width: `${node.coverage.followingTotal === 0 ? 100 : Math.min(100, (node.coverage.followingLoaded / node.coverage.followingTotal) * 100)}%`,
            }}
          />
        </div>
        {node.coverage.truncated ? (
          <p>Each click resumes from the last page and loads up to 2,500 more in each direction.</p>
        ) : null}
      </div>
      <section className="drawer-section">
        <h3>Languages</h3>
        <div className="tag-row">
          {node.languages.length ? (
            node.languages.map((value) => (
              <span className="tag" key={value}>
                {value}
              </span>
            ))
          ) : (
            <span className="muted">Not enriched yet</span>
          )}
        </div>
      </section>
      <section className="drawer-section">
        <h3>Topics</h3>
        <div className="tag-row">
          {node.topics.length ? (
            node.topics.map((value) => (
              <span className="tag green" key={value}>
                {value}
              </span>
            ))
          ) : (
            <span className="muted">Expand to enrich this profile</span>
          )}
        </div>
      </section>
      <div className="drawer-actions">
        <button
          className="button primary"
          disabled={expand.isPending || networkComplete}
          onClick={() => expand.mutate()}
        >
          <GitFork size={16} />
          {expand.isPending
            ? "Loading network…"
            : networkComplete
              ? "Network fully loaded"
              : "Load next network batch"}
        </button>
        {expand.error ? <p className="action-error">{expand.error.message}</p> : null}
        <a
          className="button ghost"
          href={`https://github.com/${node.login}`}
          target="_blank"
          rel="noreferrer"
        >
          Open GitHub <ChevronRight size={16} />
        </a>
      </div>
    </aside>
  );
}

export function GraphExplorer() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["graph"],
    queryFn: fetchGraph,
  });
  const [selected, setSelected] = useState<GraphNode>();
  const [search, setSearch] = useState("");
  const [relationship, setRelationship] = useState<Relationship | "all">("all");
  const [listMode, setListMode] = useState(false);
  const selectedId = selected?.id;

  useEffect(() => {
    if (!data || !selectedId) return;
    const updated = data.nodes.find((node) => node.id === selectedId);
    if (updated) setSelected(updated);
  }, [data, selectedId]);

  const filtered = useMemo(() => {
    if (!data) return undefined;
    const query = search.trim().toLowerCase();
    const nodes = data.nodes.filter(
      (node) =>
        (relationship === "all" || node.relationship === relationship) &&
        (!query ||
          node.login.toLowerCase().includes(query) ||
          node.name?.toLowerCase().includes(query) ||
          node.languages.some((language) => language.toLowerCase().includes(query)) ||
          node.topics.some((topic) => topic.toLowerCase().includes(query))),
    );
    const ids = new Set(nodes.map((node) => node.id));
    return {
      ...data,
      nodes,
      edges: data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  }, [data, relationship, search]);

  if (isLoading)
    return (
      <div className="graph-loading">
        <span className="loading-orbit" />
        <p>Mapping your GitHub universe…</p>
      </div>
    );
  if (error || !filtered)
    return (
      <div className="empty-state">
        <div>
          <h2>We couldn’t load the graph</h2>
          <p>{error instanceof Error ? error.message : "Try again shortly."}</p>
          <button className="button" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </div>
    );

  return (
    <div className="explorer-shell">
      <header className="explorer-toolbar">
        <div className="explorer-title">
          <span className="eyebrow">Network explorer</span>
          <h1>Your orbit</h1>
          <p>
            {filtered.nodes.length} people · {filtered.edges.length} connections
            {filtered.nodes.length >= filtered.limits.maxNodes
              ? " · view capped for performance"
              : ""}
          </p>
        </div>
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people, language, topic…"
            aria-label="Search graph"
          />
        </div>
        <div className="toolbar-actions">
          <label className="filter-select">
            <Filter size={15} />
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as typeof relationship)}
              aria-label="Relationship filter"
            >
              <option value="all">All relationships</option>
              <option value="mutual">Mutual</option>
              <option value="following">Following</option>
              <option value="follower">Followers</option>
              <option value="none">Discoveries</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label={listMode ? "Show canvas" : "Show accessible list"}
            onClick={() => setListMode((value) => !value)}
          >
            {listMode ? <Focus size={17} /> : <List size={17} />}
          </button>
          <button className="icon-button" aria-label="Refresh graph" onClick={() => void refetch()}>
            <RefreshCw size={17} className={isFetching ? "spin" : ""} />
          </button>
        </div>
      </header>
      <div className="explorer-body">
        {listMode ? (
          <div className="graph-list" role="list" aria-label="People in loaded graph">
            {filtered.nodes.map((node) => (
              <button role="listitem" key={node.id} onClick={() => setSelected(node)}>
                <span
                  className="node-dot"
                  style={{ background: relationshipColors[node.relationship] }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={node.avatarUrl} alt="" />
                <span>
                  <strong>{node.name ?? node.login}</strong>
                  <small>
                    @{node.login} · {node.relationship}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <GraphCanvas data={filtered} selectedId={selected?.id} onSelect={setSelected} />
        )}
        {selected ? <ProfileDrawer node={selected} onClose={() => setSelected(undefined)} /> : null}
      </div>
    </div>
  );
}
