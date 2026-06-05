import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  private readonly _logger = new Logger(InfiniteWorkflowRegister.name);

  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!process.env.RUN_CRON) return;

    const workflows = [
      { name: 'missingPostWorkflow', id: 'missing-post-workflow' },
      { name: 'analyticsCollectionWorkflow', id: 'analytics-collection-workflow' },
      { name: 'commentsCollectionWorkflow', id: 'comments-collection-workflow' },
    ];

    for (const { name, id } of workflows) {
      try {
        const handle = this._temporalService.client?.getRawClient()?.workflow;
        if (!handle) continue;

        try {
          const desc = await handle.getHandle(id).describe();
          if (desc.status?.name === 'RUNNING') {
            this._logger.log(`Workflow ${id} already running, skipping`);
            continue;
          }
          this._logger.warn(`Workflow ${id} is in status ${desc.status?.name}, restarting`);
        } catch (describeErr: any) {
          if (!describeErr.message?.includes('Workflow execution not found')) {
            this._logger.error(`Error describing workflow ${id}`, describeErr.message);
            continue;
          }
        }

        await handle.start(name, { workflowId: id, taskQueue: 'main' });
        this._logger.log(`Started workflow ${id}`);
      } catch (err: any) {
        this._logger.error(`Failed to start workflow ${id}`, err.message);
      }
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
