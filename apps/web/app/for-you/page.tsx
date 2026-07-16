import { redirect } from "next/navigation";
import Link from "next/link";
import { Network } from "lucide-react";
import { getConfig, isAdmin } from "@github-orbit/config";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { RecommendationFeed } from "../../components/recommendation-feed";
import { getViewer } from "../../lib/auth";

export const metadata = { title: "For you" };
export const dynamic = "force-dynamic";

export default async function ForYouPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return (
    <AppShell
      viewer={viewer}
      demo={getConfig().DEMO_MODE}
      admin={viewer.role === "admin" || isAdmin(viewer.login)}
    >
      <div className="content-page recommendation-page">
        <PageHeader
          eyebrow="Personalized discovery"
          title="People worth knowing"
          description="Ranked from your public network, repositories, topics, and languages. Every suggestion shows its evidence."
          actions={
            <Link className="button ghost" href="/explore">
              <Network size={15} /> Expand network
            </Link>
          }
        />
        <RecommendationFeed />
      </div>
    </AppShell>
  );
}
