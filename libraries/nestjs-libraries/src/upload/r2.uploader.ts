import {
  UploadPartCommand,
  S3Client,
  ListPartsCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { MultipartUploadService } from '@gitroom/nestjs-libraries/database/prisma/media/multipart-upload.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
};

function normalizeExtension(filename: string): string | null {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXT_TO_MIME[ext] ? ext : null;
}

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ACCESS_KEY,
  CLOUDFLARE_SECRET_ACCESS_KEY,
  CLOUDFLARE_BUCKETNAME,
  CLOUDFLARE_BUCKET_URL,
} = process.env;

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_ACCESS_KEY!,
    secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

function generateRandomString() {
  return makeId(20);
}

export default async function handleR2Upload(
  endpoint: string,
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  switch (endpoint) {
    case 'create-multipart-upload':
      return createMultipartUpload(req, res, orgId, multipartService);
    case 'prepare-upload-parts':
      return prepareUploadParts(req, res, orgId, multipartService);
    case 'complete-multipart-upload':
      return completeMultipartUpload(req, res, orgId, multipartService);
    case 'list-parts':
      return listParts(req, res, orgId, multipartService);
    case 'abort-multipart-upload':
      return abortMultipartUpload(req, res, orgId, multipartService);
    case 'sign-part':
      return signPart(req, res, orgId, multipartService);
  }
  return res.status(404).end();
}

export async function simpleUpload(
  data: Buffer,
  originalFilename: string,
  _contentType: string
) {
  const detected = await fromBuffer(data);
  if (!detected || !Object.values(ALLOWED_EXT_TO_MIME).includes(detected.mime)) {
    throw new Error('Unsupported file type.');
  }
  const fileExtension = `.${detected.ext}`;
  const safeContentType = detected.mime;
  const randomFilename = generateRandomString() + fileExtension;

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: randomFilename,
    Body: data,
    ContentType: safeContentType,
  };

  const command = new PutObjectCommand({ ...params });
  await R2.send(command);

  return CLOUDFLARE_BUCKET_URL + '/' + randomFilename;
}

async function checkMultipartOwnership(
  orgId: string | undefined,
  key: string,
  uploadId: string,
  multipartService: MultipartUploadService | undefined,
): Promise<{ allowed: boolean; error?: string }> {
  if (!orgId || !multipartService) {
    return { allowed: false, error: 'Multipart context required' };
  }
  const record = await multipartService.verifyOwnership(orgId, uploadId, key);
  if (!record) {
    return { allowed: false, error: 'Upload not found or access denied' };
  }
  if (record.state === 'completed') {
    return { allowed: false, error: 'Upload already completed' };
  }
  if (record.state === 'aborted') {
    return { allowed: false, error: 'Upload already aborted' };
  }
  if (record.state === 'failed') {
    return { allowed: false, error: 'Upload previously failed' };
  }
  return { allowed: true };
}

export async function createMultipartUpload(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { file, fileHash } = req.body;
  const safeExt = normalizeExtension(file?.name || '');
  if (!safeExt) {
    return res.status(400).json({ message: 'Unsupported file type.' });
  }
  const safeContentType = ALLOWED_EXT_TO_MIME[safeExt];
  const randomFilename = generateRandomString() + safeExt;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: `${randomFilename}`,
      ContentType: safeContentType,
      Metadata: {
        'x-amz-meta-file-hash': fileHash,
      },
    };

    const command = new CreateMultipartUploadCommand({ ...params });
    const response = await R2.send(command);

    // Record in multipart ledger
    if (orgId && multipartService && response.UploadId) {
      await multipartService.create({
        organizationId: orgId,
        uploadId: response.UploadId,
        key: randomFilename,
        fileName: file?.name,
        fileHash,
        expectedMime: safeContentType,
      }).catch((err) => {
        console.error('Failed to create multipart ledger entry:', err);
      });
    }

    return res.status(200).json({
      uploadId: response.UploadId,
      key: response.Key,
    });
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json({ source: { status: 500 } });
  }
}

export async function prepareUploadParts(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { partData } = req.body;
  const parts = partData.parts;

  // Ownership check
  if (orgId && multipartService && partData.key && partData.uploadId) {
    const { allowed, error } = await checkMultipartOwnership(orgId, partData.key, partData.uploadId, multipartService);
    if (!allowed) {
      return res.status(403).json({ message: error });
    }
  }

  // Bound part count
  if (parts?.length > 1000) {
    return res.status(400).json({ message: 'Part count exceeds maximum (1000)' });
  }

  const response: { presignedUrls: Record<string, string> } = {
    presignedUrls: {},
  };

  for (const part of parts) {
    // Bound part number
    if (!part.number || part.number < 1 || part.number > 10000) {
      return res.status(400).json({ message: `Invalid part number: ${part.number}` });
    }

    try {
      const params = {
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: partData.key,
        PartNumber: part.number,
        UploadId: partData.uploadId,
      };
      const command = new UploadPartCommand({ ...params });
      const url = await getSignedUrl(R2, command, { expiresIn: 3600 });

      // @ts-ignore
      response.presignedUrls[part.number] = url;

      // Track part count
      if (orgId && multipartService) {
        await multipartService.incrementPartCount(orgId, partData.uploadId).catch(() => {});
      }
    } catch (err) {
      console.log('Error', err);
      return res.status(500).json(err);
    }
  }

  return res.status(200).json(response);
}

export async function listParts(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { key, uploadId } = req.body;

  // Ownership check
  if (orgId && multipartService && key && uploadId) {
    const { allowed, error } = await checkMultipartOwnership(orgId, key, uploadId, multipartService);
    if (!allowed) {
      return res.status(403).json({ message: error });
    }
  }

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new ListPartsCommand({ ...params });
    const response = await R2.send(command);

    return res.status(200).json(response['Parts']);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function completeMultipartUpload(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { key, uploadId, parts } = req.body;

  // Ownership check
  if (orgId && multipartService && key && uploadId) {
    const { allowed, error } = await checkMultipartOwnership(orgId, key, uploadId, multipartService);
    if (!allowed) {
      return res.status(403).json({ message: error });
    }
  }

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    const response = await R2.send(command);

    const safeExt = normalizeExtension(key || '');
    if (!safeExt) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      if (orgId && multipartService) {
        await multipartService.markFailed(orgId, uploadId).catch(() => {});
      }
      return res.status(400).json({ message: 'Unsupported file type.' });
    }
    const expectedMime = ALLOWED_EXT_TO_MIME[safeExt];

    const head = await R2.send(
      new GetObjectCommand({
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: key,
        Range: 'bytes=0-4100',
      })
    );
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const chunk of head.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const prefix = Buffer.concat(chunks);
    const detected = await fromBuffer(prefix);

    if (!detected || detected.mime !== expectedMime) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      if (orgId && multipartService) {
        await multipartService.markFailed(orgId, uploadId).catch(() => {});
      }
      return res
        .status(400)
        .json({ message: 'File contents do not match declared type.' });
    }

    response.Location =
      process.env.CLOUDFLARE_BUCKET_URL +
      '/' +
      response?.Location?.split('/').at(-1);

    // Mark as completed
    if (orgId && multipartService) {
      await multipartService.markCompleted(orgId, uploadId).catch(() => {});
    }

    return response;
  } catch (err) {
    if (orgId && multipartService) {
      await multipartService.markFailed(orgId, uploadId).catch(() => {});
    }
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function abortMultipartUpload(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { key, uploadId } = req.body;

  // Ownership check
  if (orgId && multipartService && key && uploadId) {
    const { allowed, error } = await checkMultipartOwnership(orgId, key, uploadId, multipartService);
    if (!allowed) {
      return res.status(403).json({ message: error });
    }
  }

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new AbortMultipartUploadCommand({ ...params });
    const response = await R2.send(command);

    if (orgId && multipartService) {
      await multipartService.markAborted(orgId, uploadId).catch(() => {});
    }

    return res.status(200).json(response);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function signPart(
  req: Request,
  res: Response,
  orgId?: string,
  multipartService?: MultipartUploadService
) {
  const { key, uploadId } = req.body;
  const partNumber = parseInt(req.body.partNumber);

  // Ownership check
  if (orgId && multipartService && key && uploadId) {
    const { allowed, error } = await checkMultipartOwnership(orgId, key, uploadId, multipartService);
    if (!allowed) {
      return res.status(403).json({ message: error });
    }
  }

  // Bound part number
  if (!partNumber || partNumber < 1 || partNumber > 10000) {
    return res.status(400).json({ message: `Invalid part number: ${partNumber}` });
  }

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: key,
    PartNumber: partNumber,
    UploadId: uploadId,
    Expires: 3600,
  };

  const command = new UploadPartCommand({ ...params });
  const url = await getSignedUrl(R2, command, { expiresIn: 3600 });

  return res.status(200).json({
    url: url,
  });
}
