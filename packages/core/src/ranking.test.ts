import { describe, expect, it } from "vitest";
import { jaccard, scoreCandidate } from "./ranking";

describe("ranker-v1", () => {
  it("applies the locked weights deterministically", () => {
    const result = scoreCandidate({
      pageRank: 1,
      commonNeighbors: 1,
      embeddingSimilarity: 1,
      topicSimilarity: 1,
      languageSimilarity: 1,
      activity: 1,
      exploration: 1,
    });
    expect(result.score).toBeCloseTo(1);
  });

  it("clamps invalid feature values", () => {
    const result = scoreCandidate({
      pageRank: 2,
      commonNeighbors: -1,
      embeddingSimilarity: Number.NaN,
      topicSimilarity: 0,
      languageSimilarity: 0,
      activity: 0,
      exploration: 0,
    });
    expect(result.score).toBe(0.3);
  });

  it("computes case-insensitive Jaccard similarity", () => {
    expect(jaccard(["React", "TypeScript"], ["react", "Rust"])).toBeCloseTo(1 / 3);
  });
});
