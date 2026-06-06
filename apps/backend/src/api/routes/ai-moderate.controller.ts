import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { Request } from 'express';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';
import { GuardrailViolation } from '@gitroom/nestjs-libraries/ai/governance/errors';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

class ModerateRequest {
  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(['output', 'input'])
  direction?: 'output' | 'input' = 'output';

  @IsOptional()
  @IsBoolean()
  checkImage?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

interface ModerateResponse {
  passed: boolean;
  warnings?: string[];
  redactedContent?: string;
}

@ApiTags('AI Moderation')
@Controller('/ai')
export class AiModerateController {
  constructor(private readonly _guardrails: GuardrailService) {}

  @Post('/moderate')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  @HttpCode(HttpStatus.OK)
  async moderate(@Body() body: ModerateRequest, @Req() req: Request): Promise<ModerateResponse> {
    const { content, direction = 'output', checkImage, imageUrl } = body;
    const orgId = (req as any).org?.id;

    const warnings: string[] = [];

    let result: string;

    try {
      if (direction === 'input') {
        result = await this._guardrails.checkInput(content, { orgId });
      } else {
        result = await this._guardrails.checkOutput(content, { orgId });
      }
    } catch (err) {
      if (err instanceof GuardrailViolation) {
        return {
          passed: false,
          warnings: [err.message],
        };
      }
      throw err;
    }

    if (result !== content) {
      return {
        passed: true,
        warnings: ['Content was partially redacted'],
        redactedContent: result,
      };
    }

    if (checkImage && imageUrl) {
      warnings.push('Image moderation requires a vision provider — skipped');
    }

    return {
      passed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
