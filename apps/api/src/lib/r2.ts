import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1)
});

export type R2Env = z.infer<typeof envSchema>;

let cached: { env: R2Env; client: S3Client } | null = null;

function getR2() {
  if (cached) return cached;
  const env = envSchema.parse(process.env);
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    },
    forcePathStyle: true
  });

  cached = { env, client };
  return cached;
}

export async function signPutObject({
  key,
  contentType,
  expiresInSeconds = 300
}: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const { env, client } = getR2();
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });

  const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
  return { signedUrl: url, expiresInSeconds, bucket: env.R2_BUCKET_NAME, r2Key: key };
}

export async function signGetObject({
  key,
  expiresInSeconds = 300
}: {
  key: string;
  expiresInSeconds?: number;
}) {
  const { env, client } = getR2();
  const cmd = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key
  });

  const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
  return { signedUrl: url, expiresInSeconds };
}

export async function deleteObject({ key }: { key: string }) {
  const { env, client } = getR2();
  const cmd = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key
  });
  await client.send(cmd);
}

