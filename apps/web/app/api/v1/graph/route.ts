import { getConfig } from "@github-orbit/config";
import { demoGraph } from "@github-orbit/core/demo";
import { requireViewer } from "../../../../lib/auth";
import { loadGraph } from "../../../../lib/data";
import { apiError, noStoreJson } from "../../../../lib/http";

export async function GET() {
  try {
    const viewer = await requireViewer();
    return noStoreJson(getConfig().DEMO_MODE ? demoGraph : await loadGraph(viewer));
  } catch (error) {
    return apiError(error);
  }
}
