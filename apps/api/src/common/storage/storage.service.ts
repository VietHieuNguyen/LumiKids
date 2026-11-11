import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../config/storage.config.js';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    const options = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
    };
    this.client = new S3Client({ ...options, endpoint: config.endpoint });
    this.signingClient = new S3Client({
      ...options,
      endpoint: config.publicEndpoint,
    });
  }

  async checkBucket(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
    } catch {
      throw new ServiceUnavailableException('Asset storage is unavailable.');
    }
  }

  async uploadObject(
    key: string,
    body: Buffer,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.checkBucket();
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
          ContentLength: body.length,
          IfNoneMatch: '*',
          CacheControl: 'private, no-store',
        }),
      );
    } catch {
      throw new ServiceUnavailableException('Asset upload failed.');
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch {
      throw new ServiceUnavailableException('Asset cleanup failed.');
    }
  }

  async getReadUrl(key: string, mimeType: string) {
    try {
      // Signing alone does not contact storage. HEAD detects missing objects/buckets first.
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const url = await getSignedUrl(
        this.signingClient,
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          ResponseContentType: mimeType,
          ResponseContentDisposition: 'inline',
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: this.config.readUrlTtlSeconds },
      );
      return {
        url,
        expiresIn: this.config.readUrlTtlSeconds,
        expiresAt: new Date(
          Date.now() + this.config.readUrlTtlSeconds * 1000,
        ).toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Asset read URL is unavailable.');
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.signingClient.destroy();
  }
}
