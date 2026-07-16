import Link from "next/link";
import { ArrowRight, GitBranch, Github, Network, ShieldCheck, Sparkles } from "lucide-react";
import { getConfig } from "@github-orbit/config";
import { getViewer } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const config = getConfig();
  const viewer = await getViewer();
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Github size={20} />
          </span>
          <span>Orbit</span>
        </Link>
        <div className="landing-nav-actions">
          <span className="private-beta">
            <span className="status-dot" /> Private beta
          </span>
          <Link
            className="button primary"
            href={viewer ? "/explore" : "/auth/github/start?intent=signin"}
          >
            {viewer ? "Open explorer" : "Connect GitHub"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Your GitHub universe, mapped</p>
          <h1>
            Find the people
            <br />
            behind the <em>code.</em>
          </h1>
          <p className="hero-text">
            Explore the communities around your GitHub network and get explainable recommendations
            for developers worth following.
          </p>
          <div className="hero-actions">
            <Link
              className="button primary large"
              href={viewer ? "/explore" : "/auth/github/start?intent=signin"}
            >
              {config.DEMO_MODE ? "Explore the live demo" : "Connect your GitHub"}
              <Github size={18} />
            </Link>
            <a href="#how" className="button ghost large">
              See how it works
            </a>
          </div>
          <p className="permission-note">
            <ShieldCheck size={14} /> Read-only by default. No private repositories.
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-line line-one" />
          <div className="orbit-line line-two" />
          <div className="hero-node center">
            <Github size={28} />
          </div>
          {[
            ["M", "n1"],
            ["R", "n2"],
            ["P", "n3"],
            ["A", "n4"],
            ["L", "n5"],
            ["T", "n6"],
          ].map(([label, className]) => (
            <div key={className} className={`hero-node ${className}`}>
              {label}
            </div>
          ))}
          <div className="floating-card fc-one">
            <Network size={15} />
            <span>12 mutual connections</span>
          </div>
          <div className="floating-card fc-two">
            <Sparkles size={15} />
            <span>94% match</span>
          </div>
        </div>
      </section>
      <section className="how-section" id="how">
        <article>
          <span>01</span>
          <Network />
          <h2>See your network</h2>
          <p>Followers, following, mutuals, and communities on one explorable canvas.</p>
        </article>
        <article>
          <span>02</span>
          <GitBranch />
          <h2>Trace the connection</h2>
          <p>Understand how people and open-source communities connect to each other.</p>
        </article>
        <article>
          <span>03</span>
          <Sparkles />
          <h2>Discover thoughtfully</h2>
          <p>Recommendations explain the network, topics, and languages behind every match.</p>
        </article>
      </section>
    </main>
  );
}
