/**
 * Object storage: profile photos and generated PDFs.
 *
 * Local development writes to a folder; production writes to S3 (spec §3).
 * The rest of the application only ever sees a storage key.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { getEnv } from './env';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  url(key: string): Promise<string>;
}

class LocalStorage implements StorageDriver {
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    const target = resolve(this.root, key.replace(/^\/+/, ''));
    // A key is data from a URL. `join` happily resolves ".." out of the root,
    // so the result is checked to be inside it rather than trusting the input.
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('不正なファイルキーである');
    }
    return target;
  }
  async put(key: string, body: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async url(key: string) {
    return `/api/files/${encodeURIComponent(key)}`;
  }
}

class S3Storage implements StorageDriver {
  private bucket: string;
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client>;

  constructor() {
    const env = getEnv();
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET が設定されていない');
    this.bucket = env.S3_BUCKET;
    this.clientPromise = import('@aws-sdk/client-s3').then(
      ({ S3Client }) =>
        new S3Client({
          region: env.S3_REGION,
          ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
          ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
            ? {
                credentials: {
                  accessKeyId: env.S3_ACCESS_KEY_ID,
                  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                },
              }
            : {}),
        }),
    );
  }

  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.clientPromise;
    const result = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async url(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.clientPromise;
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 300 },
    );
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = getEnv();
  driver =
    env.STORAGE_DRIVER === 's3'
      ? new S3Storage()
      : new LocalStorage(env.STORAGE_LOCAL_PATH);
  return driver;
}
