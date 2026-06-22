import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository', () => ({
  AutopostRepository: class {
    getAutoposts = vi.fn();
    createAutopost = vi.fn().mockResolvedValue({ id: 'ap-1' });
    changeActive = vi.fn().mockResolvedValue({ id: 'ap-1' });
    deleteAutopost = vi.fn().mockResolvedValue({ id: 'ap-1' });
    getAutopost = vi.fn();
    updateUrl = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {
    getIntegrationsList = vi.fn().mockResolvedValue([]);
    getIntegrationById = vi.fn();
    getPlugs = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class {
    findFreeDateTime = vi.fn().mockResolvedValue('2026-01-01T12:00:00');
    createPost = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/ai-model.provider', () => ({
  AIModelProvider: class {
    langchainModel = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/media.service', () => ({
  AiMediaService: class {
    generateImage = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: { send: vi.fn() },
  isInngestEnabled: vi.fn().mockReturnValue(true),
}));

import { AutopostService } from './autopost.service';
import {
  inngest,
  isInngestEnabled,
} from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';

describe('AutopostService.processCron Inngest dispatch', () => {
  let service: AutopostService;

  beforeEach(() => {
    vi.mocked(isInngestEnabled).mockReturnValue(true);
    vi.clearAllMocks();
    vi.mocked(inngest.send).mockResolvedValue(undefined);

    service = new AutopostService(
      new AutopostRepository(),
      new IntegrationService(),
      new PostsService(),
      new AIModelProvider(),
      new AiMediaService()
    );
  });

  it('sends autopost/process when active and Inngest is enabled', async () => {
    await service.processCron(true, 'org-1', 'ap-1');

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'autopost/process',
      data: { id: 'ap-1' },
      id: 'autopost-ap-1',
    });
  });

  it('sends autopost/cancel when inactive and Inngest is enabled', async () => {
    await service.processCron(false, 'org-1', 'ap-1');

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'autopost/cancel',
      data: { id: 'ap-1' },
    });
  });

  it('skips autopost/process when Inngest is disabled', async () => {
    vi.mocked(isInngestEnabled).mockReturnValue(false);

    await service.processCron(true, 'org-1', 'ap-1');

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('skips autopost/cancel when Inngest is disabled', async () => {
    vi.mocked(isInngestEnabled).mockReturnValue(false);

    const result = await service.processCron(false, 'org-1', 'ap-1');

    expect(inngest.send).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
