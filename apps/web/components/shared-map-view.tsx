"use client";
import { useState } from "react";
import { Github, LockKeyhole } from "lucide-react";
import type { GraphNode, GraphPayload } from "@github-orbit/core";
import { GraphCanvas } from "./graph-explorer";
export function SharedMapView({
  graph,
  name,
  description,
}: {
  graph: GraphPayload;
  name: string;
  description: string;
}) {
  const [selected, setSelected] = useState<GraphNode>();
  return (
    <main className="shared-map">
      <header>
        <div>
          <span className="brand-mark">
            <Github size={19} />
          </span>
          <div>
            <h1>{name}</h1>
            <p>{description}</p>
          </div>
        </div>
        <span>
          <LockKeyhole size={13} />
          Read-only secret link
        </span>
      </header>
      <div className="shared-stage">
        <GraphCanvas data={graph} selectedId={selected?.id} onSelect={setSelected} />
        {selected ? (
          <div className="shared-profile card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.avatarUrl} alt="" />
            <div>
              <strong>{selected.name ?? selected.login}</strong>
              <span>@{selected.login}</span>
            </div>
            <a
              className="button ghost"
              href={`https://github.com/${selected.login}`}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        ) : null}
      </div>
    </main>
  );
}
