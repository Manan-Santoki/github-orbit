"use client";

import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { GraphNode, GraphPayload, Relationship } from "@github-orbit/core";
import { buildStableGraphLayout } from "./graph-layout";

const relationshipColors: Record<Relationship, string> = {
  self: "#85f0ca",
  following: "#71a7ff",
  follower: "#b392ff",
  mutual: "#f3c768",
  none: "#77839a",
};

type GraphCanvasProps = {
  data: GraphPayload;
  selectedId: string | undefined;
  onSelect: (node: GraphNode) => void;
};

export function GraphCanvas({ data, selectedId, onSelect }: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const selectedIdRef = useRef(selectedId);
  const hoveredIdRef = useRef<string | undefined>(undefined);
  const focusIdRef = useRef<string | undefined>(undefined);
  const incidentEdgesRef = useRef(new Map<string, string[]>());
  const focusedEdgeIdsRef = useRef(new Set<string>());
  const coreEdgeIdsRef = useRef(new Set<string>());

  const refreshFocus = (focusId: string | undefined) => {
    focusIdRef.current = focusId;
    const incident = focusId ? (incidentEdgesRef.current.get(focusId) ?? []) : [];
    const core = incident.filter((edgeId) => coreEdgeIdsRef.current.has(edgeId));
    const detail = incident.filter((edgeId) => !coreEdgeIdsRef.current.has(edgeId)).slice(0, 320);
    focusedEdgeIdsRef.current = new Set([...core, ...detail]);
    rendererRef.current?.refresh();
  };

  useEffect(() => {
    selectedIdRef.current = selectedId;
    refreshFocus(hoveredIdRef.current ?? selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!container.current) return;
    const graph = new Graph({ type: "directed", multi: false });
    const isInitialLayout = positionsRef.current.size === 0;
    const denseGraph = data.nodes.length > 1_500;
    const layout = buildStableGraphLayout(data, positionsRef.current);
    positionsRef.current = layout;
    data.nodes.forEach((node) => {
      const position = layout.get(node.id) ?? { x: 0, y: 0 };
      graph.addNode(node.id, {
        label: node.login,
        x: position.x,
        y: position.y,
        size:
          node.kind === "viewer"
            ? 12
            : node.relationship === "mutual"
              ? denseGraph
                ? 6.5
                : 8
              : node.kind === "recommended"
                ? denseGraph
                  ? 3
                  : 5
                : node.kind === "second_hop" && denseGraph
                  ? 1.8
                  : 6,
        color: relationshipColors[node.relationship],
        forceLabel: node.kind === "viewer",
      });
    });

    const incidentEdges = new Map<string, string[]>();
    const coreEdgeIds = new Set<string>();
    data.edges.forEach((edge) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target) || graph.hasEdge(edge.id))
        return;
      if (edge.source === data.center || edge.target === data.center) coreEdgeIds.add(edge.id);
      incidentEdges.set(edge.source, [...(incidentEdges.get(edge.source) ?? []), edge.id]);
      incidentEdges.set(edge.target, [...(incidentEdges.get(edge.target) ?? []), edge.id]);
      graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        color: "rgba(113, 167, 255, 0.38)",
        size: 0.55,
      });
    });
    incidentEdgesRef.current = incidentEdges;
    coreEdgeIdsRef.current = coreEdgeIds;
    refreshFocus(hoveredIdRef.current ?? selectedIdRef.current);

    if (graph.order > 2 && graph.order < 400 && isInitialLayout) {
      forceAtlas2.assign(graph, {
        iterations: Math.min(45, 18 + Math.ceil(graph.order / 20)),
        settings: forceAtlas2.inferSettings(graph),
      });
    }
    graph.forEachNode((node, attributes) => {
      positionsRef.current.set(node, { x: attributes.x as number, y: attributes.y as number });
    });

    const renderer = new Sigma(graph, container.current, {
      renderEdgeLabels: false,
      labelColor: { color: "#cdd5e4" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelRenderedSizeThreshold: denseGraph ? 8 : 7,
      defaultEdgeColor: "rgba(129,147,182,.22)",
      defaultNodeColor: "#77839a",
      minCameraRatio: 0.08,
      maxCameraRatio: 8,
      hideEdgesOnMove: graph.size > 500,
      nodeReducer: (node, attributes) =>
        node === focusIdRef.current
          ? {
              ...attributes,
              color: "#f8fafc",
              size: Math.max(5, attributes.size * 1.45),
              forceLabel: true,
            }
          : attributes,
      edgeReducer: (edge, attributes) => {
        const focusId = focusIdRef.current;
        const visible = focusId
          ? focusedEdgeIdsRef.current.has(edge)
          : coreEdgeIdsRef.current.has(edge);
        return {
          ...attributes,
          hidden: !visible,
          ...(focusId && visible ? { color: "rgba(133, 240, 202, 0.72)", size: 0.85 } : {}),
        };
      },
    });

    renderer.on("clickNode", ({ node }) => {
      const selected = data.nodes.find((item) => item.id === node);
      if (selected) onSelect(selected);
    });
    renderer.on("enterNode", ({ node }) => {
      hoveredIdRef.current = node;
      refreshFocus(node);
    });
    renderer.on("leaveNode", () => {
      hoveredIdRef.current = undefined;
      refreshFocus(selectedIdRef.current);
    });
    rendererRef.current = renderer;

    return () => {
      renderer.kill();
      graph.clear();
      rendererRef.current = null;
    };
  }, [data, onSelect]);

  return (
    <div className={`graph-stage${selectedId ? " drawer-open" : ""}`}>
      <div
        ref={container}
        className="sigma-container"
        aria-label="Interactive GitHub relationship graph"
      />
      <div className="graph-controls" aria-label="Canvas controls">
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => rendererRef.current?.getCamera().animatedZoom()}
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => rendererRef.current?.getCamera().animatedUnzoom()}
        >
          <Minus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Reset view"
          onClick={() => rendererRef.current?.getCamera().animatedReset()}
        >
          <LocateFixed size={17} />
        </button>
      </div>
      <div className="graph-legend">
        {(["following", "follower", "mutual", "none"] as Relationship[]).map((value) => (
          <span key={value}>
            <i style={{ background: relationshipColors[value] }} />
            {value === "none" ? "Discovery" : value}
          </span>
        ))}
      </div>
      <div className="graph-hint">Hover or select a person to trace their relationships</div>
    </div>
  );
}
