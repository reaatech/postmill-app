import { Injectable } from '@nestjs/common';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import type { AIScope } from '@gitroom/nestjs-libraries/ai/ai-provider.interface';

@Injectable()
export class AiDesignerBudgetGuard {
  constructor(private readonly _budget: BudgetService) {}

  async checkStartBudget(orgId: string): Promise<{ allowed: boolean; reason?: string }> {
    return this._budget.checkBudget('agent', orgId);
  }

  async checkScope(scope: AIScope, orgId: string): Promise<{ allowed: boolean; reason?: string }> {
    return this._budget.checkBudget(scope, orgId);
  }
}
