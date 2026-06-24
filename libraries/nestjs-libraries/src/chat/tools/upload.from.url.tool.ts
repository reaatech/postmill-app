import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { fetch as undiciFetch } from 'undici';
import { Readable } from 'stream';
import { fromBuffer } from 'file-type';

const ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

@Injectable()
export class UploadFromUrlTool implements AgentToolInterface {
  constructor(
    private _fileService: FileService,
    private _storageService: StorageService,
  ) {}
  name = 'uploadFromUrlTool';

  run() {
    return createTool({
      id: 'uploadFromUrlTool',
      description: `Upload a remote image or video into the media library from a public URL.
Use this before scheduling a post when the user provides an external media URL (not already hosted on our domain),
so the attachment passes the upload-domain validation. Returns the hosted media { id, path } to use as an attachment.`,
      mcp: {
        annotations: {
          title: 'Upload Media From URL',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe('The public URL of the image or video to upload'),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        const response = (await undiciFetch(inputData.url, {
          dispatcher: ssrfSafeDispatcher,
        })) as unknown as Response;

        if (!response.ok) {
          throw new Error('Failed to fetch URL');
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const detected = await fromBuffer(buffer);
        if (!detected || !ALLOWED_MIME.has(detected.mime)) {
          throw new Error('Unsupported file type.');
        }

        const adapter = await this._storageService.getLocalAdapterForOrg(org.id, true);
        const getFile = await adapter.uploadFile({
          buffer,
          mimetype: detected.mime,
          size: buffer.length,
          path: '',
          fieldname: '',
          destination: '',
          stream: new Readable(),
          filename: '',
          originalname: `upload.${detected.ext}`,
          encoding: '',
        });

        return this._fileService.saveFile(
          org.id,
          getFile.originalname,
          getFile.path
        );
      },
    });
  }
}
