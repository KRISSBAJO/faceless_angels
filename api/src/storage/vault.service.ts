import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config';

const SCHEME = 'aes-256-gcm:v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const ACCEPTED_FILE_TYPES = 'PDF, JPG, or PNG';

export interface StoredFile {
  storage: string;
  key: string;
  encryption: string | null;
}

/** Returns the real type from the file's leading bytes, or null if it is not one we accept. */
export function sniffMimeType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return 'image/png';
  }
  return null;
}

/** Like sniffMimeType, for pictures shown on the site. */
export function sniffImageType(bytes: Buffer): string | null {
  const type = sniffMimeType(bytes);
  if (type === 'image/jpeg' || type === 'image/png') return type;
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Holds bills and identity papers. Every file is encrypted here before it
 * leaves the process, so the bucket or disk only ever sees ciphertext.
 */
@Injectable()
export class VaultService implements OnModuleInit {
  private readonly log = new Logger(VaultService.name);
  private key: Buffer;
  private s3: S3Client | null = null;

  onModuleInit() {
    const key = Buffer.from(config.storage.encryptionKey, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'EVIDENCE_ENCRYPTION_KEY must be 32 random bytes in base64. ' +
          'Make one with: openssl rand -base64 32',
      );
    }
    this.key = key;
    if (config.storage.bucket) {
      // Credentials come from AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
      this.s3 = new S3Client({ region: config.storage.region });
      this.log.log('Storing documents in S3.');
    } else if (config.production) {
      // A hosted container loses its disk on every deploy.
      throw new Error(
        'AWS_S3_BUCKET must be set in production. Documents cannot live on the container disk.',
      );
    } else {
      this.log.log('Storing documents on local disk.');
    }
  }

  /**
   * Stores a file. Private files, the default, are encrypted first.
   * Pass `published` only for things meant for everyone, like a cover image.
   */
  async put(
    folder: string,
    bytes: Buffer,
    options: { published?: boolean } = {},
  ): Promise<StoredFile> {
    const key = `${folder}/${randomUUID()}.bin`;
    const encryption = options.published ? null : SCHEME;
    const body = options.published ? bytes : this.seal(bytes);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: config.storage.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/octet-stream',
          ServerSideEncryption: 'AES256',
        }),
      );
      return { storage: 's3', key, encryption };
    }
    const path = join(config.storage.localDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
    return { storage: 'local', key, encryption };
  }

  async get(file: StoredFile): Promise<Buffer> {
    const raw =
      file.storage === 's3'
        ? await this.fromS3(file.key)
        : await readFile(join(config.storage.localDir, file.key));
    if (file.encryption === null) return raw;
    if (file.encryption !== SCHEME) {
      throw new Error(`Unknown encryption scheme ${file.encryption}.`);
    }
    return this.open(raw);
  }

  private async fromS3(key: string) {
    if (!this.s3) throw new Error('This file is in S3, but no bucket is set.');
    const found = await this.s3.send(
      new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }),
    );
    if (!found.Body) throw new Error('The stored file is empty.');
    return Buffer.from(await found.Body.transformToByteArray());
  }

  private seal(bytes: Buffer) {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  private open(sealed: Buffer) {
    const iv = sealed.subarray(0, IV_BYTES);
    const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  }
}
