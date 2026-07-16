import { createHash } from "node:crypto";
import { getConfig } from "@github-orbit/config";

export const PROFILE_TEXT_VERSION = "profile-template-v1";

export type ProfileTextInput = {
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  repositories: Array<{
    name: string;
    description?: string | null;
    topics?: string[];
    language?: string | null;
  }>;
};

export function buildProfileText(input: ProfileTextInput): string {
  const repositories = input.repositories
    .filter(
      (repository) => repository.description || repository.topics?.length || repository.language,
    )
    .slice(0, 10)
    .map((repository) => {
      const parts = [
        repository.name,
        repository.description,
        repository.language ? `Language: ${repository.language}` : undefined,
        repository.topics?.length
          ? `Topics: ${repository.topics.slice(0, 10).join(", ")}`
          : undefined,
      ].filter(Boolean);
      return parts.join(" — ");
    });
  return [
    input.bio ? `Bio: ${input.bio}` : undefined,
    input.company ? `Company: ${input.company}` : undefined,
    input.location ? `Location: ${input.location}` : undefined,
    repositories.length ? `Public repositories:\n${repositories.join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24_000);
}

export function profileTextHash(text: string): string {
  return createHash("sha256").update(`${PROFILE_TEXT_VERSION}\n${text}`).digest("hex");
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }

  get retryable(): boolean {
    return this.status === 429 || this.status === 529 || this.status >= 500;
  }
}

export class OpenRouterClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0 || inputs.length > 50) {
      throw new Error("OpenRouter embedding batch must contain 1 to 50 inputs");
    }
    const config = getConfig();
    if (!config.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");
    const response = await this.fetcher("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.APP_URL,
        "X-Title": config.APP_NAME,
      },
      body: JSON.stringify({
        model: config.OPENROUTER_MODEL,
        input: inputs,
        dimensions: config.OPENROUTER_DIMENSIONS,
        encoding_format: "float",
        provider: { data_collection: "deny", allow_fallbacks: true },
      }),
    });
    const body = (await response.json().catch(() => undefined)) as
      | { data?: Array<{ index: number; embedding: number[] }>; error?: { message?: string } }
      | undefined;
    if (!response.ok || !body?.data) {
      throw new OpenRouterError(
        response.status,
        body?.error?.message ?? `OpenRouter request failed with ${response.status}`,
        body,
      );
    }
    const ordered = body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    for (const embedding of ordered) {
      if (embedding.length !== config.OPENROUTER_DIMENSIONS) {
        throw new OpenRouterError(
          502,
          `Expected ${config.OPENROUTER_DIMENSIONS} dimensions, received ${embedding.length}`,
        );
      }
    }
    return ordered;
  }
}
