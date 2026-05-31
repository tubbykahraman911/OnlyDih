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

function getStorage() {
  if (cached) return cached;
  const env = envSchema.parse(process.env);
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
  const { env, client } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
