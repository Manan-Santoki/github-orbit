import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { getConfig } from "@github-orbit/config";

export const QUEUE_NAME = "orbit-jobs";

export type OrbitJob =
  | { name: "sync-account"; data: { accountId: string; syncRunId: string } }
  | {
      name: "expand-user";
      data: {
        accountId: string;
        login: string;
        syncRunId: string;
        direction: "followers" | "following" | "both";
      };
    }
  | { name: "embed-users"; data: { accountId: string; userIds?: string[] } }
  | { name: "rank-account"; data: { accountId: string } }
  | { name: "cleanup"; data: Record<string, never> };

let connection: IORedis | undefined;
let queue: Queue | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return connection;
}

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000, jitter: 0.25 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 2_000 },
      },
    });
  }
  return queue;
}

export async function addOrbitJob<T extends OrbitJob>(
  job: T,
  options: JobsOptions = {},
): Promise<string> {
  const result = await getQueue().add(job.name, job.data, options);
  return String(result.id);
}

export async function closeQueues(): Promise<void> {
  await queue?.close();
  await connection?.quit();
  queue = undefined;
  connection = undefined;
}
