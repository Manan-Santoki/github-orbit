"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Check,
  ExternalLink,
  GitFork,
  Network,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import type { CollectionSummary, Recommendation } from "@github-orbit/core";

async function loadRecommendations(): Promise<Recommendation[]> {
  const response = await fetch("/api/v1/recommendations", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load recommendations");
  return ((await response.json()) as { items: Recommendation[] }).items;
}

async function feedback(login: string, action: string, reason?: string) {
  const response = await fetch(`/api/v1/recommendations/${login}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  if (!response.ok) throw new Error("Unable to save feedback");
}

export function RecommendationFeed() {
  const queryClient = useQueryClient();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["recommendations"], queryFn: loadRecommendations });
  const { data: collectionData } = useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const response = await fetch("/api/v1/collections");
      return response.json() as Promise<{ items: CollectionSummary[] }>;
    },
  });
  const [topic, setTopic] = useState("all");
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const topics = useMemo(
    () => [...new Set(data.flatMap((item) => item.candidate.topics))].slice(0, 8),
    [data],
  );
  const visible = data.filter((item) => !hidden.has(item.candidate.login));
  const filtered =
    topic === "all" ? visible : visible.filter((item) => item.candidate.topics.includes(topic));

  const dismiss = useMutation({
    mutationFn: (login: string) => feedback(login, "dismiss"),
    onSuccess: (_data, login) => {
      setHidden((current) => new Set(current).add(login));
      void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
  const follow = useMutation({
    mutationFn: async (login: string) => {
      const response = await fetch(`/api/v1/follows/${login}`, { method: "PUT" });
      const body = await response.json();
      if (response.status === 428 && body.authorizeUrl) {
        window.location.href = body.authorizeUrl;
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Follow failed");
      await feedback(login, "follow");
      setFollowed((current) => new Set(current).add(login));
    },
  });
  const save = useMutation({
    mutationFn: async (login: string) => {
      let collection = collectionData?.items[0];
      if (!collection) {
        const created = await fetch("/api/v1/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Saved people",
            description: "Developers saved from your recommendations.",
          }),
        });
        if (!created.ok) throw new Error("Unable to create a collection");
        collection = (await created.json()) as CollectionSummary;
      }
      const response = await fetch(`/api/v1/collections/${collection.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      if (!response.ok) throw new Error("Unable to save developer");
      await feedback(login, "save");
    },
    onSuccess: (_data, login) => {
      setSaved((current) => new Set(current).add(login));
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  if (isLoading)
    return (
      <div className="empty-state">
        <div>
          <span className="loading-orbit" />
          <p>Ranking your network…</p>
        </div>
      </div>
    );
  if (error)
    return (
      <div className="empty-state">
        <div>
          <h2>Recommendations are taking a break</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  return (
    <>
      <div className="topic-filter">
        <button className={topic === "all" ? "active" : ""} onClick={() => setTopic("all")}>
          All
        </button>
        {topics.map((value) => (
          <button
            key={value}
            className={topic === value ? "active" : ""}
            onClick={() => setTopic(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="recommendation-list">
        {filtered.map((item) => (
          <article className="recommendation-card card" key={item.candidate.id}>
            <div className="recommendation-rank">#{item.rank}</div>
            <div className="recommendation-profile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.candidate.avatarUrl} alt="" />
              <div>
                <h2>{item.candidate.name ?? item.candidate.login}</h2>
                <p className="handle">@{item.candidate.login}</p>
              </div>
              <div className="match-score">
                <Sparkles size={13} />
                <strong>{Math.round(item.score * 100)}%</strong>
                <span>match</span>
              </div>
            </div>
            <p className="recommendation-bio">
              {item.candidate.bio ?? "This developer has not added a public bio yet."}
            </p>
            <div className="recommendation-tags">
              {item.sharedLanguages.map((value) => (
                <span className="tag" key={value}>
                  {value}
                </span>
              ))}
              {item.sharedTopics.map((value) => (
                <span className="tag green" key={value}>
                  {value}
                </span>
              ))}
            </div>
            <div className="why-box">
              <div className="why-title">
                <Network size={14} /> Why this person
              </div>
              {item.reasons.map((reason, index) => (
                <p key={`${reason.type}-${index}`}>
                  <span className="reason-line" />
                  {reason.label}
                </p>
              ))}
            </div>
            <div className="recommendation-stats">
              <span>
                <strong>{item.candidate.followers.toLocaleString()}</strong> followers
              </span>
              <span>
                <GitFork size={13} /> Public GitHub profile
              </span>
            </div>
            <div className="recommendation-actions">
              <button
                className={
                  followed.has(item.candidate.login) ? "button followed" : "button primary"
                }
                onClick={() => follow.mutate(item.candidate.login)}
                disabled={follow.isPending || followed.has(item.candidate.login)}
              >
                {followed.has(item.candidate.login) ? <Check size={15} /> : <UserPlus size={15} />}
                {followed.has(item.candidate.login) ? "Following" : "Follow"}
              </button>
              <button
                className={saved.has(item.candidate.login) ? "button followed" : "button ghost"}
                onClick={() => save.mutate(item.candidate.login)}
                disabled={saved.has(item.candidate.login) || save.isPending}
              >
                {saved.has(item.candidate.login) ? <Check size={15} /> : <Bookmark size={15} />}{" "}
                {saved.has(item.candidate.login) ? "Saved" : "Save"}
              </button>
              <a
                className="button ghost"
                href={`https://github.com/${item.candidate.login}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => void feedback(item.candidate.login, "open")}
              >
                <ExternalLink size={15} /> Profile
              </a>
              <button
                className="icon-button dismiss-button"
                aria-label={`Dismiss ${item.candidate.login}`}
                onClick={() => dismiss.mutate(item.candidate.login)}
              >
                <X size={16} />
              </button>
            </div>
          </article>
        ))}
        {!filtered.length ? (
          <div className="empty-state">
            <div>
              <h2>No matches in this filter</h2>
              <p>Try another topic or expand more people from your graph.</p>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
