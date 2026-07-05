import { Mastra } from '@mastra/core/mastra';
import { ConsoleLogger } from '@mastra/core/logger';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { Injectable } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';

@Injectable()
export class MastraService {
  // Memoize the in-flight PROMISE, not the resolved value: two concurrent first
  // callers would otherwise both see the cache empty, both `await agent()`, and
  // both `new Mastra(...)` — double-building and double-registering in-process
  // handlers. Caching the promise makes the build happen exactly once.
  private static _mastraPromise: Promise<Mastra> | null = null;

  constructor(private _loadToolsService: LoadToolsService) {}

  async mastra() {
    if (!MastraService._mastraPromise) {
      MastraService._mastraPromise = (async () =>
        new Mastra({
          storage: pStore,
          agents: {
            postmill: await this._loadToolsService.agent(),
          },
          logger: new ConsoleLogger({
            level: 'info',
          }),
        }))();
    }

    return MastraService._mastraPromise;
  }
}
