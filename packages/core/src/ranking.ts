import type { RecommendationReason } from "./index";

export type RankingFeatures = {
  pageRank: number;
  commonNeighbors: number;
  embeddingSimilarity: number;
  topicSimilarity: number;
  languageSimilarity: number;
  activity: number;
  exploration: number;
};

export const RANKER_VERSION = "ranker-v1";

const weights: Record<keyof RankingFeatures, number> = {
  pageRank: 0.3,
  commonNeighbors: 0.2,
  embeddingSimilarity: 0.2,
  topicSimilarity: 0.1,
  languageSimilarity: 0.08,
  activity: 0.07,
  exploration: 0.05,
};

const labels: Record<keyof RankingFeatures, RecommendationReason["type"]> = {
  pageRank: "network",
  commonNeighbors: "network",
  embeddingSimilarity: "semantic",
  topicSimilarity: "topics",
  languageSimilarity: "languages",
  activity: "activity",
  exploration: "explore",
};

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function scoreCandidate(features: RankingFeatures): {
  score: number;
  contributions: Array<{ feature: keyof RankingFeatures; value: number; weighted: number }>;
} {
  const contributions = (Object.keys(weights) as Array<keyof RankingFeatures>).map((feature) => {
    const value = clamp01(features[feature]);
    return { feature, value, weighted: value * weights[feature] };
  });
  return {
    score: contributions.reduce((sum, item) => sum + item.weighted, 0),
    contributions,
  };
}

export function explanationReasons(
  features: RankingFeatures,
  context: { mutualCount?: number; sharedTopics?: string[]; sharedLanguages?: string[] } = {},
): RecommendationReason[] {
  return scoreCandidate(features)
    .contributions.filter((item) => item.weighted > 0)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3)
    .map((item) => ({
      type: labels[item.feature],
      contribution: item.weighted,
      label: reasonLabel(item.feature, context),
    }));
}

function reasonLabel(
  feature: keyof RankingFeatures,
  context: { mutualCount?: number; sharedTopics?: string[]; sharedLanguages?: string[] },
): string {
  switch (feature) {
    case "pageRank":
      return "Well connected to people in your network";
    case "commonNeighbors":
      return `${context.mutualCount ?? "Several"} people in your network connect to this developer`;
    case "embeddingSimilarity":
      return "Their public GitHub profile is semantically similar to yours";
    case "topicSimilarity":
      return `Shared topics: ${(context.sharedTopics ?? []).slice(0, 3).join(", ") || "related projects"}`;
    case "languageSimilarity":
      return `Shared languages: ${(context.sharedLanguages ?? []).slice(0, 3).join(", ") || "similar stacks"}`;
    case "activity":
      return "Recently active on public projects";
    case "exploration":
      return "Adds variety beyond your usual network";
  }
}

export function jaccard(left: string[], right: string[]): number {
  const a = new Set(left.map((value) => value.toLowerCase()));
  const b = new Set(right.map((value) => value.toLowerCase()));
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
