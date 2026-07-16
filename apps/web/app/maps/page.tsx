import { redirect } from "next/navigation";
import { getConfig, isAdmin } from "@github-orbit/config";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { SavedMaps } from "../../components/saved-maps";
import { getViewer } from "../../lib/auth";
export const metadata = { title: "Saved maps" };
export const dynamic = "force-dynamic";
export default async function MapsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return (
    <AppShell
      viewer={viewer}
      demo={getConfig().DEMO_MODE}
      admin={viewer.role === "admin" || isAdmin(viewer.login)}
    >
      <div className="content-page">
        <PageHeader
          eyebrow="Snapshots"
          title="Saved maps"
          description="Capture a point in your exploration and share selected public relationships through revocable secret links."
        />
        <SavedMaps />
      </div>
    </AppShell>
  );
}
