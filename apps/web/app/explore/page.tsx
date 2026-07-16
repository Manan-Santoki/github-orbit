import { redirect } from "next/navigation";
import { getConfig, isAdmin } from "@github-orbit/config";
import { AppShell } from "../../components/app-shell";
import { GraphExplorer } from "../../components/graph-explorer";
import { getViewer } from "../../lib/auth";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return (
    <AppShell
      viewer={viewer}
      demo={getConfig().DEMO_MODE}
      admin={viewer.role === "admin" || isAdmin(viewer.login)}
    >
      <GraphExplorer />
    </AppShell>
  );
}
