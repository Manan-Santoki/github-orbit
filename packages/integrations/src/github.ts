import { getConfig } from "@github-orbit/config";

export type GitHubProfile = {
  id: number;
  node_id: string;
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  avatar_url: string;
  html_url: string;
  type: string;
  followers: number;
  following: number;
  public_repos: number;
  updated_at: string;
};

export type GitHubListUser = Pick<
  GitHubProfile,
  "id" | "node_id" | "login" | "avatar_url" | "html_url" | "type"
>;

export type GitHubRepository = {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  stargazers_count: number;
  topics?: string[];
  language: string | null;
  pushed_at: string | null;
};

export type RateLimit = {
  limit?: number;
  remaining?: number;
  resetAt?: Date;
  retryAfterSeconds?: number;
};

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly rateLimit: RateLimit,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }

  get retryable(): boolean {
    return (
      this.status === 429 || this.status >= 500 || (this.status === 403 && !!this.rateLimit.resetAt)
    );
  }
}

type RequestOptions = {
  method?: "GET" | "PUT" | "DELETE" | "POST";
  etag?: string;
  lastModified?: string;
  body?: unknown;
};

export type GitHubResponse<T> = {
  data: T;
  status: number;
  etag?: string;
  lastModified?: string;
  rateLimit: RateLimit;
  notModified: boolean;
};

function headerNumber(headers: Headers, key: string): number | undefined {
  const value = headers.get(key);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rateLimitFrom(headers: Headers): RateLimit {
  const limit = headerNumber(headers, "x-ratelimit-limit");
  const remaining = headerNumber(headers, "x-ratelimit-remaining");
  const reset = headerNumber(headers, "x-ratelimit-reset");
  const retryAfterSeconds = headerNumber(headers, "retry-after");
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(reset !== undefined ? { resetAt: new Date(reset * 1000) } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<GitHubResponse<T>> {
    const config = getConfig();
    const headers = new Headers({
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": config.GITHUB_API_VERSION,
      "User-Agent": "github-orbit",
    });
    if (options.etag) headers.set("If-None-Match", options.etag);
    if (options.lastModified) headers.set("If-Modified-Since", options.lastModified);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.method === "PUT" || options.method === "DELETE") headers.set("Content-Length", "0");

    const response = await this.fetcher(`https://api.github.com${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const rateLimit = rateLimitFrom(response.headers);
    if (response.status === 304) {
      return { data: undefined as T, status: 304, rateLimit, notModified: true };
    }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const message =
        body && typeof body === "object" && "message" in body
          ? String(body.message)
          : `GitHub request failed with ${response.status}`;
      throw new GitHubApiError(response.status, message, rateLimit, body);
    }
    const data = response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    return {
      data,
      status: response.status,
      rateLimit,
      notModified: false,
      ...(etag ? { etag } : {}),
      ...(lastModified ? { lastModified } : {}),
    };
  }

  getViewer(): Promise<GitHubResponse<GitHubProfile>> {
    return this.request("/user");
  }

  getUser(
    login: string,
    cache: { etag?: string; lastModified?: string } = {},
  ): Promise<GitHubResponse<GitHubProfile>> {
    return this.request(`/users/${encodeURIComponent(login)}`, cache);
  }

  listFollowers(
    login: string,
    page = 1,
    cache: { etag?: string; lastModified?: string } = {},
  ): Promise<GitHubResponse<GitHubListUser[]>> {
    return this.request(
      `/users/${encodeURIComponent(login)}/followers?per_page=100&page=${page}`,
      cache,
    );
  }

  listFollowing(
    login: string,
    page = 1,
    cache: { etag?: string; lastModified?: string } = {},
  ): Promise<GitHubResponse<GitHubListUser[]>> {
    return this.request(
      `/users/${encodeURIComponent(login)}/following?per_page=100&page=${page}`,
      cache,
    );
  }

  listRepositories(login: string, page = 1): Promise<GitHubResponse<GitHubRepository[]>> {
    return this.request(
      `/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&direction=desc&per_page=10&page=${page}`,
    );
  }

  follow(login: string): Promise<GitHubResponse<void>> {
    return this.request(`/user/following/${encodeURIComponent(login)}`, { method: "PUT" });
  }

  unfollow(login: string): Promise<GitHubResponse<void>> {
    return this.request(`/user/following/${encodeURIComponent(login)}`, { method: "DELETE" });
  }
}

export function buildGitHubAuthorizeUrl(input: {
  intent: "signin" | "follow";
  state: string;
  codeChallenge: string;
}): string {
  const config = getConfig();
  if (!config.GITHUB_CLIENT_ID) throw new Error("GITHUB_CLIENT_ID is not configured");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GITHUB_OAUTH_CALLBACK);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.intent === "follow" ? "user:follow" : "");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeGitHubCode(
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; scopes: string[] }> {
  const config = getConfig();
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    throw new Error("GitHub OAuth credentials are not configured");
  }
  const response = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: config.GITHUB_OAUTH_CALLBACK,
      code_verifier: codeVerifier,
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "GitHub OAuth exchange failed");
  }
  return {
    accessToken: body.access_token,
    scopes: (body.scope ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}
