import { redirect } from "next/navigation";
import { getConfig, isAdmin } from "@github-orbit/config";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { SettingsPanel } from "../../components/settings-panel";
import { getViewer } from "../../lib/auth";
export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return (
    <AppShell
      viewer={viewer}
      demo={getConfig().DEMO_MODE}
      admin={viewer.role === "admin" || isAdmin(viewer.login)}
    >
      <div className="content-page settings-page">
        <PageHeader
          eyebrow="Account and privacy"
          title="Settings"
          description="Control GitHub permissions, synchronization, and your stored data."
        />
        <SettingsPanel viewer={viewer} demo={getConfig().DEMO_MODE} />
      </div>
    </AppShell>
  );
}
