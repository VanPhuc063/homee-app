import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Cloudflare R2 (S3-compatible). App upload thẳng lên R2 bằng presigned URL —
 * media không đi qua API server nên server rẻ và nhanh.
 */
@Injectable()
export class StorageService {
  private client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  async presignUpload(stepId: string, contentType: string) {
    return this.presign(`steps/${stepId}`, contentType);
  }

  /// Ảnh/bill vật tư tập kết — cùng cơ chế presigned URL, khác prefix để tách biệt với ảnh
  /// bằng chứng thi công.
  async presignMaterialCheckUpload(projectId: string, contentType: string) {
    return this.presign(`material-checks/${projectId}`, contentType);
  }

  /// Ảnh quảng cáo — admin upload từ trang /admin.
  async presignAdUpload(contentType: string) {
    return this.presign('ads', contentType);
  }

  private async presign(prefix: string, contentType: string) {
    const ext = contentType.split('/')[1] ?? 'bin';
    const objectKey = `${prefix}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: objectKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 600 });
    return {
      uploadUrl,
      objectKey,
      publicUrl: `${process.env.R2_PUBLIC_BASE_URL}/${objectKey}`,
    };
  }
}
