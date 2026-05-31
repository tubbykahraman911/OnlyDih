import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const envSchema = z.object({
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
});

let cached: { env: z.infer<typeof envSchema>; client: S3Client } | null = null;
const localUploadRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.local-uploads");

export class StorageConfigurationError extends Error {
  constructor() {
    super(
      process.env.NODE_ENV === "production"
        ? "Private object storage is not configured."
        : "Storage is not configured in local development."
    );
  }
}

function storageEnvIsConfigured() {
  return envSchema.safeParse(process.env).success;
}

export function isPrivateStorageConfigured() {
  return storageEnvIsConfigured();
}

export function canUseLocalUploadFallback() {
  return process.env.NODE_ENV !== "production" && !storageEnvIsConfigured();
}

function getStorage() {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new StorageConfigurationError();
  const env = parsed.data;
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    },
    forcePathStyle: true
  });
  cached = { env, client };
  return cached;
}

export async function createPresignedUploadUrl(key: string, mimeType: string) {
  const { env, client } = getStorage();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: mimeType
  });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

export async function deletePrivateObject(key: string) {
  if (canUseLocalUploadFallback()) {
    const localPath = localPathForStorageKey(key);
    await rm(localPath, { force: true }).catch(() => undefined);
    return;
  }
  const { env, client } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export function localPathForStorageKey(key: string) {
  const safeSegments = key.split("/").map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
  const localPath = resolve(localUploadRoot, ...safeSegments);
  if (!localPath.startsWith(localUploadRoot)) throw new Error("Invalid local upload path");
  return localPath;
}

export async function saveLocalPrivateObject(key: string, body: Buffer) {
  const localPath = localPathForStorageKey(key);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, body);
}

export async function readRequestBody(stream: NodeJS.ReadableStream, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error("Image exceeds upload limit");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
