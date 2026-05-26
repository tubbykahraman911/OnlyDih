import Redis from "ioredis";
import { EventEmitter } from "node:events";

const bus = new EventEmitter();

let redisPub: Redis | null = null;

function redisUrl() {
  return process.env.REDIS_URL;
}

function hasRedis() {
  return !!redisUrl();
}

export async function publish(channel: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  if (!hasRedis()) {
    bus.emit(channel, msg);
    return;
  }
  if (!redisPub) {
    redisPub = new Redis(redisUrl()!, { lazyConnect: true });
    await redisPub.connect();
  }
  await redisPub.publish(channel, msg);
}

export function subscribe(channel: string, onMessage: (payload: unknown) => void) {
  if (!hasRedis()) {
    const handler = (msg: string) => onMessage(JSON.parse(msg));
    bus.on(channel, handler);
    return () => bus.off(channel, handler);
  }

  const sub = new Redis(redisUrl()!, { lazyConnect: true });
  const handler = (_chan: string, msg: string) => {
    try {
      onMessage(JSON.parse(msg));
    } catch {
      // ignore
    }
  };

  sub.on("message", handler);
  sub.subscribe(channel).catch(() => undefined);

  return () => {
    sub.off("message", handler);
    sub.unsubscribe(channel).catch(() => undefined);
    sub.quit().catch(() => undefined);
  };
}

