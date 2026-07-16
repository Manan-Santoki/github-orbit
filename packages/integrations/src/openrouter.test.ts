import { describe, expect, it } from "vitest";
import { buildProfileText, profileTextHash } from "./openrouter";

describe("profile text", () => {
  it("uses public profile and repository metadata deterministically", () => {
    const text = buildProfileText({
      bio: "Tool maker",
      repositories: [
        {
          name: "orbit",
          description: "A network explorer",
          topics: ["graph"],
          language: "TypeScript",
        },
      ],
    });
    expect(text).toContain("Tool maker");
    expect(text).toContain("orbit");
    expect(profileTextHash(text)).toBe(profileTextHash(text));
  });
});
