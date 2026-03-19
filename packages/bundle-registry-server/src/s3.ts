import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBundleRegistryEnv } from '@/env';

let cached: S3Client | null = null;

function getClient(): S3Client {
  if (cached) return cached;
  const env = getBundleRegistryEnv();
  cached = new S3Client({
    region: env.BUNDLE_REGISTRY_S3_REGION,
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
        : undefined,
  });
  return cached;
}

export async function getObjectStream(args: { key: string }): Promise<{ contentType?: string; body: ReadableStream<Uint8Array> }> {
  const env = getBundleRegistryEnv();
  const client = getClient();
  const out = await client.send(
    new GetObjectCommand({
      Bucket: env.BUNDLE_REGISTRY_S3_BUCKET,
      Key: args.key,
    })
  );
  // AWS SDK v3 returns a web ReadableStream in Node 18+.
  const body = out.Body as unknown as ReadableStream<Uint8Array> | undefined;
  if (!body) throw new Error('Missing S3 body');
  return { contentType: out.ContentType, body };
}

export async function getObjectBuffer(args: { key: string; maxBytes: number }): Promise<{ contentType?: string; buffer: Buffer }> {
  const { contentType, body } = await getObjectStream({ key: args.key });
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > args.maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new Error(`S3 object exceeds maxBytes (${args.maxBytes})`);
    }
    chunks.push(Buffer.from(value));
  }
  return { contentType, buffer: Buffer.concat(chunks) };
}

export async function generatePresignedZipUploadUrl(args: {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
  const env = getBundleRegistryEnv();
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: env.BUNDLE_REGISTRY_S3_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: args.expiresInSeconds });
  return { uploadUrl, expiresInSeconds: args.expiresInSeconds };
}

