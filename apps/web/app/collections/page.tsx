import { redirect } from "next/navigation";
import { getConfig, isAdmin } from "@github-orbit/config";
import { AppShell } from "../../components/app-shell";
import { CollectionsGrid } from "../../components/collections-grid";
import { PageHeader } from "../../components/page-header";
import { getViewer } from "../../lib/auth";

export const metadata = { title: "Collections" };
export const dynamic = "force-dynamic";
export default async function CollectionsPage() {
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
          eyebrow="Your library"
          title="Collections"
          description="Keep the developers, maintainers, and potential collaborators you want to remember."
        />
        <CollectionsGrid />
      </div>
    </AppShell>
  );
}
