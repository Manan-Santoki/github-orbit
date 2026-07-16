"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Map, Plus, Share2, Users } from "lucide-react";
import type { GraphPayload } from "@github-orbit/core";
import { useState } from "react";

type SavedMap = {
  id: string;
  name: string;
  description: string;
  version: number;
  nodeCount: number;
  updatedAt: string;
  shared: boolean;
};
export function SavedMaps() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["maps"],
    queryFn: async () => {
      const r = await fetch("/api/v1/maps");
      return ((await r.json()) as { items: SavedMap[] }).items;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const graph = (await (await fetch("/api/v1/graph")).json()) as GraphPayload;
      const r = await fetch("/api/v1/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `My orbit · ${new Date().toLocaleDateString()}`,
          description: "Saved from the network explorer",
          nodes: graph.nodes.map((n) => ({ id: n.id, x: 0, y: 0, pinned: false })),
          edges: graph.edges,
          filters: {},
          viewport: { x: 0, y: 0, ratio: 1 },
        }),
      });
      if (!r.ok) throw new Error("Unable to save map");
      return r.json();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["maps"] }),
  });
  const share = async (id: string) => {
    const r = await fetch(`/api/v1/maps/${id}/share`, { method: "POST" });
    const body = (await r.json()) as { url: string };
    await navigator.clipboard.writeText(body.url);
    setCopied(id);
    setTimeout(() => setCopied(""), 1800);
    void qc.invalidateQueries({ queryKey: ["maps"] });
  };
  return (
    <div className="map-grid">
      <button className="map-card card new-map" onClick={() => create.mutate()}>
        <span>
          <Plus />
        </span>
        <strong>{create.isPending ? "Saving current graph…" : "Save current graph"}</strong>
        <small>Capture nodes, filters, and layout</small>
      </button>
      {data.map((map) => (
        <article className="map-card card" key={map.id}>
          <div className="map-preview">
            <Map size={35} />
            <span className="mini-node a" />
            <span className="mini-node b" />
            <span className="mini-node c" />
          </div>
          <h2>{map.name}</h2>
          <p>{map.description}</p>
          <div className="map-meta">
            <span>
              <Users size={13} />
              {map.nodeCount} nodes
            </span>
            <span>v{map.version}</span>
          </div>
          <button className="button ghost" onClick={() => void share(map.id)}>
            {copied === map.id ? (
              <Check size={15} />
            ) : map.shared ? (
              <Copy size={15} />
            ) : (
              <Share2 size={15} />
            )}{" "}
            {copied === map.id ? "Link copied" : map.shared ? "Copy new link" : "Share privately"}
          </button>
        </article>
      ))}
    </div>
  );
}
