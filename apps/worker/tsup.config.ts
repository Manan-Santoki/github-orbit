import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/health.ts"],
  format: ["esm"],
  target: "es2023",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@github-orbit\//],
  external: ["pg", "bullmq", "drizzle-orm", "drizzle-orm/node-postgres", "ioredis"],
});
