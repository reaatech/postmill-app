import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/chat/load.tools.service', () => ({
  LoadToolsService: class {
    agent = vi.fn().mockResolvedValue({
      id: 'postmill',
      name: 'postmill',
    });
  },
}));

vi.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: { _type: 'mock.mastra.store' },
}));

vi.mock('@mastra/core/mastra', () => ({
  Mastra: class {
    static instance: any;
    agents: Record<string, any>;

    constructor(config: any) {
      this.agents = config.agents ?? {};
    }

    getAgent(name: string) {
      return this.agents[name];
    }

    listAgents() {
      return this.agents;
    }
  },
}));

import { MastraService } from './mastra.service';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { Mastra } from '@mastra/core/mastra';

describe('MastraService', () => {
  beforeEach(() => {
    MastraService.mastra = undefined as any;
  });

  it('registers only the postmill agent at the top level', async () => {
    const loadToolsService = new (LoadToolsService as any)();
    const mastraService = new MastraService(loadToolsService);

    const mastra = await mastraService.mastra();
    const agents = mastra.listAgents();

    expect(Object.keys(agents)).toEqual(['postmill']);
    expect(agents.postmill.id).toBe('postmill');
  });

  it('reuses the cached Mastra instance across calls', async () => {
    const loadToolsService = new (LoadToolsService as any)();
    const mastraService = new MastraService(loadToolsService);

    const first = await mastraService.mastra();
    const second = await mastraService.mastra();

    expect(first).toBe(second);
    expect(loadToolsService.agent).toHaveBeenCalledTimes(1);
  });
});
