import { Module } from '@nestjs/common';
import { ReplicateCatalogService } from './replicate-catalog.service';
import { ReplicateRunnerService } from './replicate-runner.service';
import { ReplicateCostService } from './replicate-cost';

@Module({
  providers: [ReplicateCatalogService, ReplicateRunnerService, ReplicateCostService],
  exports: [ReplicateCatalogService, ReplicateRunnerService, ReplicateCostService],
})
export class ReplicateStudioModule {}
