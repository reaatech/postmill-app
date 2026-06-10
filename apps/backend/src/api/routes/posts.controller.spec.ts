import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class MockPostsService {},
}));

vi.mock('@gitroom/nestjs-libraries/agent/agent.graph.service', () => ({
  AgentGraphService: class MockAgentGraphService {},
}));

vi.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class MockShortLinkService {
    askShortLinkedin = vi.fn();
  },
}));

import { PostsController } from './posts.controller';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';

describe('PostsController', () => {
  let controller: PostsController;
  let shortLinkService: ShortLinkService;

  beforeEach(() => {
    vi.clearAllMocks();
    shortLinkService = new (ShortLinkService as any)();
    controller = new PostsController(
      {} as PostsService,
      {} as AgentGraphService,
      shortLinkService,
    );
  });

  describe('shouldShortlink', () => {
    it('awaits the promise from askShortLinkedin', async () => {
      const org = { id: 'org-1' } as any;
      const body = { messages: ['check https://example.com'] };
      vi.mocked(shortLinkService.askShortLinkedin).mockResolvedValue(true);

      const result = await controller.shouldShortlink(org, body);

      expect(shortLinkService.askShortLinkedin).toHaveBeenCalledWith('org-1', body.messages);
      expect(result).toEqual({ ask: true });
    });

    it('returns false when askShortLinkedin returns false', async () => {
      const org = { id: 'org-1' } as any;
      const body = { messages: ['no urls here'] };
      vi.mocked(shortLinkService.askShortLinkedin).mockResolvedValue(false);

      const result = await controller.shouldShortlink(org, body);

      expect(result).toEqual({ ask: false });
    });
  });
});
