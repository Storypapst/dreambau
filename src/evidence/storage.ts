import { createHash } from "node:crypto";

/**
 * Object storage port. The gateway is the only process that ever holds MinIO
 * credentials, and it never hands a bucket address to a client: parts arrive at
 * the API and are relayed from here.
 */

export interface UploadedPart {
  partNumber: number;
  etag: string;
  byteSize: number;
}

export interface ObjectHead {
  byteSize: number;
  contentType: string;
}

export interface ObjectStore {
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  uploadPart(key: string, uploadId: string, partNumber: number, body: Buffer): Promise<UploadedPart>;
  listParts(key: string, uploadId: string): Promise<UploadedPart[]>;
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Windowed read so large logs and traces can be scanned without buffering them whole. */
  getRange(key: string, start: number, length: number): Promise<Buffer>;
  head(key: string): Promise<ObjectHead | null>;
  delete(key: string): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`);
  }
}

/**
 * Object keys are built from opaque identifiers only. No filename, caption or
 * repository name reaches the bucket layout, so a key never leaks context.
 */
export function objectKey(runId: string, fileId: string, variant: "original" | "public" | "poster" | "thumbnail" | "report"): string {
  return `runs/${runId}/${fileId}/${variant}`;
}

export function reportEntryKey(runId: string, fileId: string, entry: string): string {
  return `runs/${runId}/${fileId}/report/${entry}`;
}

interface MemoryUpload {
  contentType: string;
  parts: Map<number, Buffer>;
}

export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  private readonly uploads = new Map<string, MemoryUpload>();
  private sequence = 0;

  async createMultipartUpload(key: string, contentType: string) {
    this.sequence += 1;
    const uploadId = `upload-${this.sequence}`;
    this.uploads.set(`${key}#${uploadId}`, { contentType, parts: new Map() });
    return uploadId;
  }

  private upload(key: string, uploadId: string) {
    const upload = this.uploads.get(`${key}#${uploadId}`);
    if (!upload) throw new Error(`unknown multipart upload for ${key}`);
    return upload;
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, body: Buffer) {
    this.upload(key, uploadId).parts.set(partNumber, Buffer.from(body));
    return { partNumber, etag: createHash("md5").update(body).digest("hex"), byteSize: body.length };
  }

  async listParts(key: string, uploadId: string) {
    return [...this.upload(key, uploadId).parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([partNumber, body]) => ({
        partNumber,
        etag: createHash("md5").update(body).digest("hex"),
        byteSize: body.length
      }));
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]) {
    const upload = this.upload(key, uploadId);
    const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
    const bodies = ordered.map((part) => {
      const body = upload.parts.get(part.partNumber);
      if (!body) throw new Error(`missing part ${part.partNumber} for ${key}`);
      return body;
    });
    this.objects.set(key, { body: Buffer.concat(bodies), contentType: upload.contentType });
    this.uploads.delete(`${key}#${uploadId}`);
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    this.uploads.delete(`${key}#${uploadId}`);
  }

  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError(key);
    return object.body;
  }

  async getRange(key: string, start: number, length: number) {
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError(key);
    return object.body.subarray(start, start + length);
  }

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { byteSize: object.body.length, contentType: object.contentType } : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  /** Test helper: every key currently stored. */
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}

export interface S3ObjectStoreOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/**
 * MinIO speaks the S3 API. The client is loaded lazily so unit tests, the CLI
 * bundle and the health endpoints never pull the SDK into memory.
 */
export async function createS3ObjectStore(options: S3ObjectStoreOptions): Promise<ObjectStore> {
  const {
    S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand,
    CompleteMultipartUploadCommand, AbortMultipartUploadCommand, PutObjectCommand,
    GetObjectCommand, HeadObjectCommand, DeleteObjectCommand
  } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle ?? true,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
  });
  const Bucket = options.bucket;
  const isMissing = (error: unknown) => {
    const name = (error as { name?: string; $metadata?: { httpStatusCode?: number } });
    return name?.name === "NoSuchKey" || name?.name === "NotFound" || name?.$metadata?.httpStatusCode === 404;
  };

  return {
    async createMultipartUpload(Key, ContentType) {
      const result = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType }));
      if (!result.UploadId) throw new Error("MinIO did not return an upload id");
      return result.UploadId;
    },
    async uploadPart(Key, UploadId, PartNumber, body) {
      const result = await client.send(new UploadPartCommand({ Bucket, Key, UploadId, PartNumber, Body: body }));
      if (!result.ETag) throw new Error("MinIO did not return a part etag");
      return { partNumber: PartNumber, etag: result.ETag.replace(/"/g, ""), byteSize: body.length };
    },
    async listParts(Key, UploadId) {
      const result = await client.send(new ListPartsCommand({ Bucket, Key, UploadId }));
      return (result.Parts ?? []).map((part) => ({
        partNumber: part.PartNumber ?? 0,
        etag: (part.ETag ?? "").replace(/"/g, ""),
        byteSize: part.Size ?? 0
      })).filter((part) => part.partNumber > 0);
    },
    async completeMultipartUpload(Key, UploadId, parts) {
      await client.send(new CompleteMultipartUploadCommand({
        Bucket, Key, UploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((left, right) => left.partNumber - right.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: `"${part.etag}"` }))
        }
      }));
    },
    async abortMultipartUpload(Key, UploadId) {
      try {
        await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId }));
      } catch (error) {
        // Aborting an upload that MinIO has already resolved or forgotten is
        // the outcome the caller wanted, not a failure to report.
        const name = (error as { name?: string }).name;
        if (isMissing(error) || name === "NoSuchUpload") return;
        throw error;
      }
    },
    async put(Key, Body, ContentType) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    async get(Key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key }));
        const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
        if (!body?.transformToByteArray) throw new ObjectNotFoundError(Key);
        return Buffer.from(await body.transformToByteArray());
      } catch (error) {
        if (isMissing(error)) throw new ObjectNotFoundError(Key);
        throw error;
      }
    },
    async getRange(Key, start, length) {
      if (length <= 0) return Buffer.alloc(0);
      try {
        const result = await client.send(new GetObjectCommand({
          Bucket, Key, Range: `bytes=${start}-${start + length - 1}`
        }));
        const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
        if (!body?.transformToByteArray) throw new ObjectNotFoundError(Key);
        return Buffer.from(await body.transformToByteArray());
      } catch (error) {
        if (isMissing(error)) throw new ObjectNotFoundError(Key);
        throw error;
      }
    },
    async head(Key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key }));
        return {
          byteSize: result.ContentLength ?? 0,
          contentType: result.ContentType ?? "application/octet-stream"
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async delete(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    }
  };
}
