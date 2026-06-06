import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  AnthropicAdapter,
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  GroqAdapter,
  LangChainAdapter,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import Anthropic from '@anthropic-ai/sdk';
import { Groq } from 'groq-sdk';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService,
    private _aiModelProvider: AIModelProvider,
  ) {}

  private async _buildServiceAdapter(orgId?: string) {
    const envKey = process.env.OPENAI_API_KEY;
    const resolved = await this._aiModelProvider.resolveConfigForScope('agent', orgId);

    if (!resolved) {
      if (envKey) {
        const surfaceDefaults = this._aiModelProvider.getSurfaceDefaults('agent');
        return new OpenAIAdapter({
          model: surfaceDefaults.textModel,
          openai: new OpenAI({ apiKey: envKey }) as any,
        });
      }
      throw new HttpException('AI provider not configured', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const isOpenAICompatible = resolved.adapter.identifier === 'openai' ||
      resolved.adapter.identifier === 'gateway' ||
      resolved.adapter.credentialFields.some((f: any) => f.key === 'baseURL');

    if (!isOpenAICompatible) {
      if (resolved.adapter.identifier === 'anthropic') {
        if (!resolved.creds.apiKey) {
          throw new HttpException('AI provider credentials not configured', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        return new AnthropicAdapter({
          model: resolved.modelId,
          anthropic: new Anthropic({ apiKey: resolved.creds.apiKey }),
        });
      }

      if (resolved.adapter.identifier === 'google') {
        if (!resolved.creds.apiKey) {
          throw new HttpException('AI provider credentials not configured', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        return new GoogleGenerativeAIAdapter({
          model: resolved.modelId,
          apiKey: resolved.creds.apiKey,
        });
      }

      if (resolved.adapter.identifier === 'groq') {
        if (!resolved.creds.apiKey) {
          throw new HttpException('AI provider credentials not configured', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        return new GroqAdapter({
          model: resolved.modelId,
          groq: new Groq({ apiKey: resolved.creds.apiKey }),
        });
      }

      try {
        const model = resolved.adapter.createLangchainModel(
          resolved.creds,
          resolved.modelId,
          resolved.defaultSurface?.temperature
            ? { temperature: resolved.defaultSurface.temperature }
            : undefined,
        );
        return new LangChainAdapter({
          chainFn: async ({ messages, tools }) => {
            const maybeToolModel =
              typeof (model as any).bindTools === 'function'
                ? (model as any).bindTools(tools)
                : model;
            if (typeof (maybeToolModel as any).stream === 'function') {
              return (maybeToolModel as any).stream(messages);
            }
            if (typeof (maybeToolModel as any).invoke === 'function') {
              return (maybeToolModel as any).invoke(messages);
            }
            throw new Error('Resolved LangChain model does not support stream() or invoke()');
          },
        });
      } catch (err) {
        throw new HttpException(
          `${resolved.adapter.name} is not supported by the CopilotKit runtime adapter: ${(err as Error).message}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const apiKey = resolved.creds.apiKey;
    if (!apiKey) {
      throw new HttpException(
        'AI provider credentials not configured',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return new OpenAIAdapter({
      model: resolved.modelId,
      openai: new OpenAI({ apiKey, baseURL: resolved.creds.baseURL || undefined }) as any,
    });
  }

  // NOTE (§3.3 #4): /copilot/chat is intentionally left WITHOUT a @CheckPolicies
  // gate to preserve pre-v3.4.0 behaviour — it was ungated before and wraps the
  // whole app layout, so adding a gate would break current clients. The asymmetry
  // with /copilot/agent (which IS gated) is deliberate and documented.
  @Post('/chat')
  async chatAgent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization?: Organization,
  ) {
    try {
      const serviceAdapter = await this._buildServiceAdapter(organization?.id);
      const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
        endpoint: '/copilot/chat',
        runtime: new CopilotRuntime(),
        serviceAdapter,
      });

      return copilotRuntimeHandler(req, res);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      Logger.warn('AI configuration not available, chat will not work');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'AI configuration not available' });
      return;
    }
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    try {
      const serviceAdapter = await this._buildServiceAdapter(organization.id);
      const mastra = await this._mastraService.mastra();
      const requestContext = new RequestContext<ChannelsContext>();
      requestContext.set(
        'integrations',
        req?.body?.variables?.properties?.integrations || []
      );

      requestContext.set('organization', JSON.stringify(organization));
      requestContext.set('ui', 'true');

      const agents = MastraAgent.getLocalAgents({
        resourceId: organization.id,
        mastra,
        requestContext: requestContext as any,
      });

      const runtime = new CopilotRuntime({
        agents,
      });

      const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
        endpoint: '/copilot/agent',
        runtime,
        serviceAdapter,
      });

      return copilotRuntimeHandler.handleRequest(req, res);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      Logger.warn('AI configuration not available, agent will not work');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'AI configuration not available' });
      return;
    }
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(
    @GetOrgFromRequest() organization: Organization,
    @Query('perPage') perPage?: string
  ) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: Number(perPage) || 50,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }

  private _safeParse<T>(raw: string): T | undefined {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
}
