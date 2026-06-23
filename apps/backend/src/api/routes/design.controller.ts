import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ApiTags } from '@nestjs/swagger';
import { DesignService } from '@gitroom/nestjs-libraries/database/prisma/design/design.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { DesignRenderService } from '@gitroom/nestjs-libraries/media/design-render/design-render.service';
import { DesignBulkService } from '@gitroom/nestjs-libraries/media/design-render/design-bulk.service';
import { RenderDesignDto } from '@gitroom/nestjs-libraries/dtos/media/render.design.dto';
import { BulkGenerateDesignDto } from '@gitroom/nestjs-libraries/dtos/media/bulk.generate.design.dto';
import type { DesignerDoc } from '@gitroom/nestjs-libraries/media/design-render/design-render.types';
import type { Response } from 'express';

@ApiTags('Design')
@Controller('/media/designs')
export class DesignController {
  constructor(
    private _designService: DesignService,
    private _fileService: FileService,
    private _designRenderService: DesignRenderService,
    private _designBulkService: DesignBulkService
  ) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async list(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this._designService.listDesigns(org.id, Number(page) || 1, Number(limit) || 20);
  }

  @Get('/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async get(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._designService.getDesign(org.id, id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: {
      name: string;
      doc: any;
      width: number;
      height: number;
      previewDataUrl?: string;
      campaignId?: string;
    },
  ) {
    return this._designService.createDesign(org.id, user.id, body);
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      doc?: any;
      width?: number;
      height?: number;
      previewDataUrl?: string;
    },
  ) {
    return this._designService.updateDesign(org.id, id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  async delete(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._designService.deleteDesign(org.id, id);
    return { success: true };
  }

  @Post('/render')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async render(
    @Body() body: RenderDesignDto,
    @Res() res: Response,
  ): Promise<void> {
    const doc = body.doc as unknown as DesignerDoc;
    const opts = { pixelRatio: body.pixelRatio, transparent: body.transparent };

    if (body.format === 'pdf') {
      const pdf = await this._designRenderService.renderPdf(doc, opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="design.pdf"');
      res.end(pdf);
      return;
    }

    const png = await this._designRenderService.renderPage(
      doc,
      body.pageIndex ?? 0,
      opts,
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="design.png"');
    res.end(png);
  }

  @Post('/bulk-generate')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async bulkGenerate(
    @Body() body: BulkGenerateDesignDto,
  ) {
    const doc = body.doc as unknown as DesignerDoc;
    const { images, truncated, totalRows } =
      await this._designBulkService.generateBatch(doc, body.rows);

    return {
      images: images.map(
        (buf) => `data:image/png;base64,${buf.toString('base64')}`,
      ),
      truncated,
      totalRows,
    };
  }
}

@ApiTags('Design Templates')
@Controller('/media/design-templates')
export class DesignTemplateController {
  constructor(private _designService: DesignService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async list(@GetOrgFromRequest() org: Organization) {
    return this._designService.listTemplates(org.id);
  }

  @Get('/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async get(@Param('id') id: string) {
    return this._designService.getTemplate(id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async create(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { name: string; category: string; doc: any },
  ) {
    return this._designService.createTemplate({ organizationId: org.id, ...body });
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  async delete(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._designService.deleteTemplate(org.id, id);
    return { success: true };
  }
}

@ApiTags('Designer Proxy')
@Controller('/media/designer')
export class DesignerProxyController {
  constructor(private _fileService: FileService) {}

  @Get('/proxy')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async proxyImage(
    @GetOrgFromRequest() org: Organization,
    @Query('fileId') fileId?: string,
    @Query('url') url?: string,
    @Res() res?: Response,
  ): Promise<void> {
    let targetUrl: string | undefined;

    if (fileId) {
      const file = await this._fileService.getFileById(fileId);
      if (!file || file.organizationId !== org.id) {
        if (!res) return null;
        res.status(404).json({ error: 'File not found' });
        return;
      }
      targetUrl = file.path;
    } else if (url) {
      targetUrl = url;
    }

    if (!targetUrl) {
      if (!res) return null;
      res.status(400).json({ error: 'fileId or url required' });
      return;
    }

    try {
      const upstream = await safeFetch(targetUrl);
      if (!upstream.ok) {
        if (!res) return null;
        res.status(upstream.status).json({ error: 'Upstream fetch failed' });
        return;
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        if (!res) return null;
        res.status(400).json({ error: 'Not an image' });
        return;
      }

      const contentLength = upstream.headers.get('content-length');
      const maxSize = 20 * 1024 * 1024;
      if (contentLength && parseInt(contentLength) > maxSize) {
        if (!res) return null;
        res.status(413).json({ error: 'Image too large' });
        return;
      }

      if (!res) return null;
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const reader = upstream.body?.getReader();
      if (reader) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (!res) return;
              res.end();
              return;
            }
            if (!res) return;
            res.write(value);
          }
        };
        pump().catch(() => { if (res) res.end(); });
      } else {
        res.end();
      }
    } catch {
      if (!res) return;
      res.status(502).json({ error: 'Proxy fetch failed' });
    }
  }
}
