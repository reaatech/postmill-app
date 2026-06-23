import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { REQUIRE_PERMISSION_KEY } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

vi.mock('@gitroom/nestjs-libraries/database/prisma/design/design.service', () => ({
  DesignService: class {},
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/file/file.service', () => ({
  FileService: class {},
}));

import {
  DesignController,
  DesignTemplateController,
} from './design.controller';

const org = { id: 'org-1' } as any;
const user = { id: 'user-1' } as any;

describe('DesignController', () => {
  let designService: {
    listDesigns: ReturnType<typeof vi.fn>;
    getDesign: ReturnType<typeof vi.fn>;
    createDesign: ReturnType<typeof vi.fn>;
    updateDesign: ReturnType<typeof vi.fn>;
    deleteDesign: ReturnType<typeof vi.fn>;
    listTemplates: ReturnType<typeof vi.fn>;
    getTemplate: ReturnType<typeof vi.fn>;
    createTemplate: ReturnType<typeof vi.fn>;
    deleteTemplate: ReturnType<typeof vi.fn>;
  };
  let fileService: {
    getFileById: ReturnType<typeof vi.fn>;
  };
  let controller: DesignController;
  let templateController: DesignTemplateController;

  beforeEach(() => {
    designService = {
      listDesigns: vi.fn(),
      getDesign: vi.fn(),
      createDesign: vi.fn(),
      updateDesign: vi.fn(),
      deleteDesign: vi.fn(),
      listTemplates: vi.fn(),
      getTemplate: vi.fn(),
      createTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
    };
    fileService = {
      getFileById: vi.fn(),
    };
    controller = new DesignController(
      designService as any,
      fileService as any,
      {} as any,
      {} as any
    );
    templateController = new DesignTemplateController(designService as any);
  });

  describe('policy and RBAC metadata', () => {
    it(' DesignController list is gated on media:read and MEDIA read policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        DesignController.prototype.list
      );
      expect(policies).toEqual([
        [AuthorizationActions.Read, Sections.MEDIA],
      ]);
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, DesignController.prototype.list)
      ).toEqual({ resource: 'media', action: 'read' });
    });

    it(' DesignController get is gated on media:read and MEDIA read policy', () => {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, DesignController.prototype.get)
      ).toEqual({ resource: 'media', action: 'read' });
    });

    it(' DesignController create is gated on media:create and MEDIA create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        DesignController.prototype.create
      );
      expect(policies).toEqual([
        [AuthorizationActions.Create, Sections.MEDIA],
      ]);
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, DesignController.prototype.create)
      ).toEqual({ resource: 'media', action: 'create' });
    });

    it(' DesignController update is gated on media:update and MEDIA update policy', () => {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, DesignController.prototype.update)
      ).toEqual({ resource: 'media', action: 'update' });
    });

    it(' DesignController delete is gated on media:delete and MEDIA delete policy', () => {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, DesignController.prototype.delete)
      ).toEqual({ resource: 'media', action: 'delete' });
    });

    it(' DesignTemplateController list is gated on media:read', () => {
      expect(
        Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          DesignTemplateController.prototype.list
        )
      ).toEqual({ resource: 'media', action: 'read' });
    });

    it(' DesignTemplateController create is gated on media:create', () => {
      expect(
        Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          DesignTemplateController.prototype.create
        )
      ).toEqual({ resource: 'media', action: 'create' });
    });

    it(' DesignTemplateController delete is gated on media:delete', () => {
      expect(
        Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          DesignTemplateController.prototype.delete
        )
      ).toEqual({ resource: 'media', action: 'delete' });
    });
  });

  describe('GET /media/designs', () => {
    it('lists designs with pagination defaults', async () => {
      const result = { designs: [{ id: 'd1' }], total: 1, page: 1, limit: 20 };
      designService.listDesigns.mockResolvedValue(result);

      expect(await controller.list(org)).toBe(result);
      expect(designService.listDesigns).toHaveBeenCalledWith('org-1', 1, 20);
    });

    it('passes explicit page and limit', async () => {
      designService.listDesigns.mockResolvedValue({ designs: [], total: 0, page: 2, limit: 10 });

      await controller.list(org, '2', '10');
      expect(designService.listDesigns).toHaveBeenCalledWith('org-1', 2, 10);
    });
  });

  describe('GET /media/designs/:id', () => {
    it('returns the org-scoped design', async () => {
      const design = { id: 'd1', name: 'Hero' };
      designService.getDesign.mockResolvedValue(design);

      expect(await controller.get(org, 'd1')).toBe(design);
      expect(designService.getDesign).toHaveBeenCalledWith('org-1', 'd1');
    });
  });

  describe('POST /media/designs', () => {
    it('creates a design scoped to the org and user', async () => {
      const body = {
        name: 'New Design',
        doc: { version: 1 },
        width: 1080,
        height: 1080,
        previewDataUrl: 'data:image/png;base64,abc',
        campaignId: 'camp-1',
      };
      const created = { id: 'd1', ...body };
      designService.createDesign.mockResolvedValue(created);

      expect(await controller.create(org, user, body)).toBe(created);
      expect(designService.createDesign).toHaveBeenCalledWith('org-1', 'user-1', body);
    });
  });

  describe('PUT /media/designs/:id', () => {
    it('updates the design and returns the result', async () => {
      const body = { name: 'Updated' };
      const updated = { id: 'd1', name: 'Updated' };
      designService.updateDesign.mockResolvedValue(updated);

      expect(await controller.update(org, 'd1', body)).toBe(updated);
      expect(designService.updateDesign).toHaveBeenCalledWith('org-1', 'd1', body);
    });
  });

  describe('DELETE /media/designs/:id', () => {
    it('deletes the design and reports success', async () => {
      designService.deleteDesign.mockResolvedValue({ id: 'd1' });

      expect(await controller.delete(org, 'd1')).toEqual({ success: true });
      expect(designService.deleteDesign).toHaveBeenCalledWith('org-1', 'd1');
    });
  });

  describe('GET /media/design-templates', () => {
    it('lists templates scoped to the org', async () => {
      const templates = [{ id: 't1' }];
      designService.listTemplates.mockResolvedValue(templates);

      expect(await templateController.list(org)).toBe(templates);
      expect(designService.listTemplates).toHaveBeenCalledWith('org-1');
    });
  });

  describe('GET /media/design-templates/:id', () => {
    it('returns the template by id', async () => {
      const template = { id: 't1', name: 'Social Post' };
      designService.getTemplate.mockResolvedValue(template);

      expect(await templateController.get('t1')).toBe(template);
      expect(designService.getTemplate).toHaveBeenCalledWith('t1');
    });
  });

  describe('POST /media/design-templates', () => {
    it('creates a template for the org', async () => {
      const body = { name: 'Template', category: 'social', doc: { version: 1 } };
      const created = { id: 't1', ...body };
      designService.createTemplate.mockResolvedValue(created);

      expect(await templateController.create(org, body)).toBe(created);
      expect(designService.createTemplate).toHaveBeenCalledWith({
        organizationId: 'org-1',
        ...body,
      });
    });
  });

  describe('DELETE /media/design-templates/:id', () => {
    it('deletes the template and reports success', async () => {
      designService.deleteTemplate.mockResolvedValue({ id: 't1' });

      expect(await templateController.delete(org, 't1')).toEqual({ success: true });
      expect(designService.deleteTemplate).toHaveBeenCalledWith('org-1', 't1');
    });
  });
});
