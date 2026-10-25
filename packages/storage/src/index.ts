import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

type StorageConfig = RuntimeConfig["storage"];

export interface StoredObject {
  readonly body: Buffer;
  readonly contentType: string | undefined;
}

/** Server-only S3-compatible object boundary shared by API upload and worker processing. */
export class S3ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: config.region,
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.config.bucket,
        ChecksumAlgorithm: "SHA256",
        ContentType: contentType,
        Key: key,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (object.Body === undefined) throw new Error("Storage object response contained no body.");
    return {
      body: Buffer.from(await object.Body.transformToByteArray()),
      contentType: object.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
