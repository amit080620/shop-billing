"use server";

import { getRedis } from "../redis";

export type RedisTestResult = {
  envVarsFound: boolean;
  urlPreview: string | null;
  connected: boolean;
  error: string | null;
  writeReadOk: boolean;
};

/** The definitive answer to "is Upstash actually connected" — not
 * just checking whether the env vars exist (they could be wrong,
 * expired, or point at a deleted database), but genuinely writing a
 * real test value to Redis and reading it back. If this comes back
 * writeReadOk: true, the connection is proven to work end-to-end;
 * anything else and the exact failure point (missing vars vs a real
 * connection error) is shown plainly rather than left ambiguous. */
export async function testRedisConnectionAction(): Promise<RedisTestResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return {
      envVarsFound: false,
      urlPreview: null,
      connected: false,
      error: "UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not set in this environment.",
      writeReadOk: false,
    };
  }

  const redis = getRedis();
  if (!redis) {
    return {
      envVarsFound: true,
      urlPreview: url,
      connected: false,
      error: "Env vars are set but the client couldn't be created — check for typos in the values.",
      writeReadOk: false,
    };
  }

  try {
    const testKey = "ray:connection-test";
    const testValue = `ok-${Date.now()}`;
    await redis.set(testKey, testValue, { ex: 60 }); // expires on its own in a minute — this is purely a diagnostic write, not real app data
    const readBack = await redis.get<string>(testKey);
    const writeReadOk = readBack === testValue;
    return {
      envVarsFound: true,
      urlPreview: url,
      connected: true,
      error: writeReadOk ? null : `Connected, but the value read back ("${readBack}") didn't match what was written ("${testValue}") — unexpected.`,
      writeReadOk,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      envVarsFound: true,
      urlPreview: url,
      connected: false,
      error: `The env vars are set, but the actual connection failed: ${message}`,
      writeReadOk: false,
    };
  }
}
