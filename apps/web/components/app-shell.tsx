"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Compass, Github, Map, Settings, ShieldCheck, LogOut, Sparkles } from "lucide-react";
import type { Viewer } from "../lib/auth";

const links = [
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/for-you", label: "For you", icon: Sparkles },
  { href: "/collections", label: "Collections", icon: Boxes },
  { href: "/maps", label: "Saved maps", icon: Map },
];

export function AppShell({
  children,
  demo = false,
  admin = false,
  viewer,
}: {
  children: React.ReactNode;
  demo?: boolean;
  admin?: boolean;
  viewer: Pick<Viewer, "login" | "name" | "avatarUrl">;
}) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/explore" className="brand" aria-label="GitHub Orbit home">
          <span className="brand-mark">
            <Github size={20} />
          </span>
          <span>Orbit</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {demo ? (
          <div className="demo-pill">
            <span className="status-dot" /> Demo data
          </div>
        ) : null}
        {admin ? (
          <Link
            href="/admin"
            className={pathname.startsWith("/admin") ? "nav-link active" : "nav-link"}
          >
            <ShieldCheck size={18} /> Admin
          </Link>
        ) : null}
        <Link
          href="/settings"
          className={pathname.startsWith("/settings") ? "nav-link active" : "nav-link"}
        >
          <Settings size={18} /> Settings
        </Link>
        <div className="profile-chip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.avatarUrl} alt="" />
          <div>
            <strong>{viewer.name ?? viewer.login}</strong>
            <span>@{viewer.login}</span>
          </div>
          {!demo ? (
            <form action="/auth/logout" method="post">
              <button className="profile-logout" aria-label="Sign out" title="Sign out">
                <LogOut size={15} />
              </button>
            </form>
          ) : null}
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
