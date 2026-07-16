"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Github,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Viewer } from "../lib/auth";

export function SettingsPanel({ viewer, demo }: { viewer: Viewer; demo: boolean }) {
  const router = useRouter();
  const {
    data: sync,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["sync"],
    queryFn: async () => {
      const r = await fetch("/api/v1/sync");
      return r.json() as Promise<{ status?: string; stage?: string; createdAt?: string }>;
    },
  });
  const refresh = async () => {
    await fetch("/api/v1/sync", { method: "POST" });
    void refetch();
  };
  const remove = async () => {
    if (
      !confirm(
        "Delete your Orbit account, saved maps, collections, feedback, and connected GitHub tokens?",
      )
    )
      return;
    await fetch("/api/v1/account", { method: "DELETE" });
    router.push("/");
    router.refresh();
  };
  return (
    <div className="settings-stack">
      <section className="settings-card card">
        <div className="settings-icon">
          <Github />
        </div>
        <div>
          <h2>GitHub account</h2>
          <p>
            Connected as <strong>@{viewer.login}</strong>. Orbit imports only public profile and
            relationship data.
          </p>
          <div className="status-row">
            <CheckCircle2 size={15} />
            Read-only connection active
          </div>
        </div>
        <a
          className="button ghost"
          href={`https://github.com/${viewer.login}`}
          target="_blank"
          rel="noreferrer"
        >
          View GitHub
        </a>
      </section>
      <section className="settings-card card">
        <div className="settings-icon">
          <KeyRound />
        </div>
        <div>
          <h2>Follow permission</h2>
          <p>
            {viewer.hasFollowPermission
              ? "You can follow and unfollow from Orbit."
              : "Orbit will request GitHub’s user:follow scope only when you first follow someone."}
          </p>
          <div className="status-row">
            <ShieldCheck size={15} />
            {viewer.hasFollowPermission ? "Permission granted" : "Not granted yet"}
          </div>
        </div>
        {!viewer.hasFollowPermission && !demo ? (
          <a className="button ghost" href="/auth/github/start?intent=follow&returnTo=/settings">
            Enable
          </a>
        ) : null}
      </section>
      <section className="settings-card card">
        <div className="settings-icon">
          <RefreshCw />
        </div>
        <div>
          <h2>Network synchronization</h2>
          <p>
            Last state: <strong>{sync?.status ?? "Not started"}</strong> ·{" "}
            {sync?.stage?.replaceAll("_", " ")}
          </p>
          <div className="status-row">
            Direct relationships refresh every 12 hours while active.
          </div>
        </div>
        <button className="button ghost" onClick={() => void refresh()} disabled={isFetching}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>
      <section className="settings-card card danger-zone">
        <div className="settings-icon">
          <AlertTriangle />
        </div>
        <div>
          <h2>Delete account</h2>
          <p>
            Permanently remove your sessions, tokens, recommendations, feedback, collections, maps,
            and secret links.
          </p>
        </div>
        <button className="button danger" onClick={() => void remove()}>
          <Trash2 size={15} />
          Delete
        </button>
      </section>
    </div>
  );
}
