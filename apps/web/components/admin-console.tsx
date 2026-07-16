"use client";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Plus, ShieldCheck, UserCheck } from "lucide-react";
type Invite = {
  id: string;
  githubLogin: string;
  createdAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
};
export function AdminConsole() {
  const qc = useQueryClient();
  const [login, setLogin] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const r = await fetch("/api/v1/admin/invites");
      return ((await r.json()) as { items: Invite[] }).items;
    },
  });
  const invite = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/v1/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      if (!r.ok) throw new Error("Unable to invite");
      return r.json();
    },
    onSuccess: () => {
      setLogin("");
      void qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }
  return (
    <>
      <div className="admin-metrics">
        <div className="card">
          <ShieldCheck />
          <strong>Private beta</strong>
          <span>Invite-only access</span>
        </div>
        <div className="card">
          <UserCheck />
          <strong>{data.filter((i) => i.redeemedAt).length}</strong>
          <span>Redeemed invites</span>
        </div>
        <div className="card">
          <Clock />
          <strong>{data.filter((i) => !i.redeemedAt && !i.revokedAt).length}</strong>
          <span>Pending invites</span>
        </div>
      </div>
      <form className="invite-form card" onSubmit={submit}>
        <div>
          <h2>Invite a GitHub user</h2>
          <p>They can sign in with this exact GitHub login.</p>
        </div>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="github-login"
          required
          pattern="[A-Za-z0-9-]+"
        />
        <button className="button primary">
          <Plus size={15} />
          Invite
        </button>
      </form>
      <div className="invite-list card">
        <div className="invite-head">
          <span>GitHub login</span>
          <span>Status</span>
          <span>Created</span>
        </div>
        {data.map((item) => (
          <div className="invite-row" key={item.id}>
            <strong>@{item.githubLogin}</strong>
            <span className={item.redeemedAt ? "tag green" : "tag"}>
              {item.redeemedAt ? (
                <>
                  <CheckCircle2 size={11} />
                  Joined
                </>
              ) : (
                "Pending"
              )}
            </span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </>
  );
}
