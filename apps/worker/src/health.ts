import { existsSync, readFileSync } from "node:fs";

const healthFile = "/tmp/orbit-worker-health";
if (!existsSync(healthFile)) process.exit(1);
const age = Date.now() - Number(readFileSync(healthFile, "utf8"));
process.exit(age < 120_000 ? 0 : 1);
