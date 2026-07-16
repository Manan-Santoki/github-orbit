"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Boxes, Plus, Users } from "lucide-react";
import type { CollectionSummary } from "@github-orbit/core";

async function getCollections(): Promise<CollectionSummary[]> {
  const response = await fetch("/api/v1/collections");
  if (!response.ok) throw new Error("Unable to load collections");
  return ((await response.json()) as { items: CollectionSummary[] }).items;
}

export function CollectionsGrid() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["collections"], queryFn: getCollections });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) throw new Error("Unable to create collection");
      return response.json();
    },
    onSuccess: () => {
      setName("");
      setDescription("");
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  if (isLoading) return <div className="empty-state">Loading collections…</div>;
  return (
    <div className="collection-grid">
      {data.map((collection, index) => (
        <article className="collection-card card" key={collection.id}>
          <div className={`collection-icon tone-${index % 3}`}>
            <Boxes size={20} />
          </div>
          <div className="collection-card-top">
            <span>
              {new Date(collection.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            <ArrowUpRight size={16} />
          </div>
          <h2>{collection.name}</h2>
          <p>{collection.description || "A private list of people from your GitHub orbit."}</p>
          <div className="collection-count">
            <Users size={14} />
            {collection.memberCount} people
          </div>
        </article>
      ))}
      {creating ? (
        <form className="collection-card card create-collection" onSubmit={submit}>
          <h2>New collection</h2>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </label>
          <div>
            <button type="button" className="button ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="button primary" disabled={create.isPending}>
              Create
            </button>
          </div>
        </form>
      ) : (
        <button className="collection-card card new-collection" onClick={() => setCreating(true)}>
          <span>
            <Plus size={20} />
          </span>
          <strong>Create collection</strong>
          <small>Organize people you discover</small>
        </button>
      )}
    </div>
  );
}
