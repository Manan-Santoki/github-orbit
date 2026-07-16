import { readFileSync } from "node:fs";
import { z } from "zod";

function secret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch (error) {
      throw new Error(`Unable to read ${name}_FILE: ${String(error)}`);
    }
  }
  return process.env[name]?.trim() || undefined;
}

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("GitHub Orbit"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: booleanString,
  PERSONAL_MODE: booleanString,
  DATABASE_URL: z.string().min(1).default("postgresql://orbit:orbit@localhost:5432/orbit"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_API_VERSION: z.string().default("2026-03-10"),
  GITHUB_OAUTH_CALLBACK: z.string().url().default("http://localhost:3000/auth/github/callback"),
  ADMIN_GITHUB_LOGINS: z.string().default(""),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/text-embedding-3-large"),
  OPENROUTER_DIMENSIONS: z.coerce.number().int().positive().max(2000).default(1024),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("orbit_session"),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) {
    cached = schema.parse({
      ...process.env,
      GITHUB_CLIENT_SECRET: secret("GITHUB_CLIENT_SECRET"),
      OPENROUTER_API_KEY: secret("OPENROUTER_API_KEY"),
      TOKEN_ENCRYPTION_KEY: secret("TOKEN_ENCRYPTION_KEY"),
    });
  }
  return cached;
}

export function isAdmin(login: string): boolean {
  const admins = getConfig()
    .ADMIN_GITHUB_LOGINS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(login.toLowerCase());
}

export function connectedConfigIssues(): string[] {
  const config = getConfig();
  if (config.DEMO_MODE) return [];
  return (["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"] as const)
    .filter((field) => !config[field])
    .map((field) => `${field} is required when DEMO_MODE=false`);
}

export function assertConnectedConfig(): void {
  const issues = connectedConfigIssues();
  if (issues.length) throw new Error(issues.join("; "));
}
