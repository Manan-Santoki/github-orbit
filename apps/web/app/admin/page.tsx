import { redirect } from "next/navigation";
import { getConfig } from "@github-orbit/config";
import { AdminConsole } from "../../components/admin-console";
import { AppShell } from "../../components/app-shell";
import { PageHeader } from "../../components/page-header";
import { requireAdmin } from "../../lib/auth";
export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  let viewer;
  try {
    viewer = await requireAdmin();
  } catch {
    redirect("/explore");
  }
  return (
    <AppShell viewer={viewer} demo={getConfig().DEMO_MODE} admin>
      <div className="content-page">
        <PageHeader
          eyebrow="Operations"
          title="Private beta"
          description="Manage invitations and monitor the product’s operational state."
        />
        <AdminConsole />
      </div>
    </AppShell>
  );
}
