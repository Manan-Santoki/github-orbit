import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, tokenHash } from "./crypto";

describe("secret utilities", () => {
  it("round-trips AES-GCM ciphertext", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSecret("github-token", key);
    expect(encrypted).not.toContain("github-token");
    expect(decryptSecret(encrypted, key)).toBe("github-token");
  });

  it("hashes tokens deterministically", () => {
    expect(tokenHash("example")).toBe(tokenHash("example"));
    expect(tokenHash("example")).not.toBe(tokenHash("different"));
  });
});
