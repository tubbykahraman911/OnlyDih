import type { NextFunction, Request, Response } from "express";
import { Redis } from "ioredis";
import { sha256 } from "../lib/crypto.js";

const localHits = new Map<string, { count: number; resetAt: number }>();
let redis: Redis | null = null;

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!redis) redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });
  return redis;
}

function clientKey(req: Request, scope: string) {
  const userPart = req.user?.id ?? req.ip ?? "unknown";
  return `rl:${scope}:${sha256(userPart)}`;
}

export function rateLimit(scope: string, limit: number, windowSeconds: number) {
  return async function limiter(req: Request, res: Response, next: NextFunction) {
    const key = clientKey(req, scope);
    const redisClient = getRedis();
    if (redisClient) {
      if (redisClient.status === "wait") await redisClient.connect();
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.expire(key, windowSeconds);
      if (count > limit) return res.status(429).json({ error: { message: "Too many requests" } });
      return next();
    }

    const now = Date.now();
    const hit = localHits.get(key);
    if (!hit || hit.resetAt <= now) {
      localHits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return next();
    }
    hit.count += 1;
    if (hit.count > limit) return res.status(429).json({ error: { message: "Too many requests" } });
    return next();
  };
}
