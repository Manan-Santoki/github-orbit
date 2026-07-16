import { requireViewer } from "../../../../lib/auth";
import { loadRecommendations } from "../../../../lib/data";
import { apiError, noStoreJson } from "../../../../lib/http";

export async function GET() {
  try {
    return noStoreJson({
      items: await loadRecommendations(await requireViewer()),
      nextCursor: null,
    });
  } catch (error) {
    return apiError(error);
  }
}
