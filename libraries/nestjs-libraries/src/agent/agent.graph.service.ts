import { Injectable, Logger } from '@nestjs/common';
import {
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { TavilySearch } from '@langchain/tavily';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { z } from 'zod';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';
import { PROMPT_CONSTANTS } from '@gitroom/nestjs-libraries/ai/prompt-constants.const';

const logger = new Logger('AgentGraphService');

const tools = !process.env.TAVILY_API_KEY
  ? ((): any[] => {
      logger.warn('TAVILY_API_KEY not set — web search will be unavailable for agent');
      return [];
    })()
  : [new TavilySearch({ maxResults: 3 })];
const toolNode = new ToolNode(tools);

interface WorkflowChannelsState {
  messages: BaseMessage[];
  orgId: string;
  question: string;
  hook?: string;
  fresearch?: string;
  category?: string;
  topic?: string;
  date?: string;
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';
  tone: 'personal' | 'company';
  content?: {
    content: string;
    website?: string;
    prompt?: string;
    image?: string;
  }[];
  isPicture?: boolean;
  popularPosts?: { content: string; hook: string }[];
}

const category = z.object({
  category: z.string().describe('The category for the post'),
});

const topic = z.object({
  topic: z.string().describe('The topic for the post'),
});

const hook = z.object({
  hook: z
    .string()
    .describe(
      'Hook for the new post, don\'t take it from "the request of the user"'
    ),
});

const contentZod = (
  isPicture: boolean,
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long'
) => {
  const content = z.object({
    content: z.string().describe('Content for the new post'),
    website: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Website for the new post if exists, If one of the post present a brand, website link must be to the root domain of the brand or don't include it, website url should contain the brand name"
      ),
    ...(isPicture
      ? {
          prompt: z
            .string()
            .describe(
              "Prompt to generate a picture for this post later, make sure it doesn't contain brand names and make it very descriptive in terms of style"
            ),
        }
      : {}),
  });

  return z.object({
    content:
      format === 'one_short' || format === 'one_long'
        ? content
        : z.array(content).min(2).describe(`Content for the new post`),
  });
};

@Injectable()
export class AgentGraphService {
  private readonly _logger = new Logger(AgentGraphService.name);
  constructor(
    private _postsService: PostsService,
    private _fileService: FileService,
    private _aiModelProvider: AIModelProvider,
    private _storageService: StorageService,
    private _aiMediaService: AiMediaService,
  ) {}
  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: (): any[] => [],
        },
        fresearch: null,
        format: null,
        tone: null,
        question: null,
        orgId: null,
        hook: null,
        content: null,
        date: null,
        category: null,
        popularPosts: null,
        topic: null,
        isPicture: null,
      },
    });

  private async _getModel(orgId: string) {
    return this._aiModelProvider.langchainModel('generator', orgId);
  }

  async startCall(state: WorkflowChannelsState) {
    const model = await this._getModel(state.orgId);
    const runTools = model.bindTools(tools);
    const response = await ChatPromptTemplate.fromTemplate(
      PROMPT_CONSTANTS.agentStartCall(dayjs().format())
    )
      .pipe(runTools)
      .invoke({
        text: state.messages[state.messages.length - 1].content,
      });

    return { messages: [response] };
  }

  async saveResearch(state: WorkflowChannelsState) {
    const content = state.messages.filter((f) => f instanceof ToolMessage);
    return { fresearch: content.map(m => m.content).join('\n') };
  }

  async findCategories(state: WorkflowChannelsState) {
    const allCategories = await this._postsService.findAllExistingCategories();
    const model = await this._getModel(state.orgId);
    const structuredOutput = model.withStructuredOutput(category);
    const { category: outputCategory } = await ChatPromptTemplate.fromTemplate(
      PROMPT_CONSTANTS.agentFindCategory
    )
      .pipe(structuredOutput)
      .invoke({
        categories: allCategories.map((p) => p.category).join(', '),
        text: state.fresearch,
      });

    return {
      category: outputCategory,
    };
  }

  async findTopic(state: WorkflowChannelsState) {
    const allTopics = await this._postsService.findAllExistingTopicsOfCategory(
      state?.category!
    );
    if (allTopics.length === 0) {
      return { topic: null };
    }

    const model = await this._getModel(state.orgId);
    const structuredOutput = model.withStructuredOutput(topic);
    const { topic: outputTopic } = await ChatPromptTemplate.fromTemplate(
      PROMPT_CONSTANTS.agentFindTopic
    )
      .pipe(structuredOutput)
      .invoke({
        topics: allTopics.map((p) => p.topic).join(', '),
        text: state.fresearch,
      });

    return {
      topic: outputTopic,
    };
  }

  async findPopularPosts(state: WorkflowChannelsState) {
    const popularPosts = await this._postsService.findPopularPosts(
      state.category!,
      state.topic
    );
    return { popularPosts };
  }

  async generateHook(state: WorkflowChannelsState) {
    const model = await this._getModel(state.orgId);
    const structuredOutput = model.withStructuredOutput(hook);
    const personMode = state.tone === 'personal' ? '1st' : '3rd';
    const { hook: outputHook } = await ChatPromptTemplate.fromTemplate(
      PROMPT_CONSTANTS.agentGenerateHook(state.tone, personMode)
    )
      .pipe(structuredOutput)
      .invoke({
        request: state.messages[0].content,
        hooks: state.popularPosts!.map((p) => p.hook).join('\n'),
        text: state.fresearch,
      });

    return {
      hook: outputHook,
    };
  }

  async generateContent(state: WorkflowChannelsState) {
    const model = await this._getModel(state.orgId);
    const structuredOutput = model.withStructuredOutput(
      contentZod(!!state.isPicture, state.format)
    );
    const personMode = state.tone === 'personal' ? '1st' : '3rd';
    const lengthInstruction =
      state.format === 'one_short' || state.format === 'thread_short'
        ? 'Post should be maximum 200 chars to fit twitter'
        : 'Post should be long';
    const countInstruction =
      state.format === 'one_short' || state.format === 'one_long'
        ? 'Post should have only 1 item'
        : 'Post should have minimum 2 items';
    const { content: outputContent } = await ChatPromptTemplate.fromTemplate(
      PROMPT_CONSTANTS.agentGenerateContent(state.tone, personMode, lengthInstruction, countInstruction)
    )
      .pipe(structuredOutput)
      .invoke({
        hook: state.hook,
        request: state.messages[0].content,
        information: state.fresearch,
      });

    return {
      content: outputContent,
    };
  }

  async fixArray(state: WorkflowChannelsState) {
    if (state.format === 'one_short' || state.format === 'one_long') {
      return {
        content: [state.content],
      };
    }

    return {};
  }

  async generatePictures(state: WorkflowChannelsState) {
    if (!state.isPicture) {
      return {};
    }

    // §10.3: image generation routes through the media surface (org media providers
    // first, AI-facade imageModel() fallback inside AiMediaService).
    const newContent = await Promise.all(
      (state.content || []).map(async (p) => {
        try {
          const image = await this._aiMediaService.generateImage(p.prompt!, {
            orgId: state.orgId,
          });
          return { ...p, image };
        } catch {
          return { ...p, image: undefined };
        }
      })
    );

    return {
      content: newContent,
    };
  }

  async uploadPictures(state: WorkflowChannelsState) {
    const all = await Promise.all(
      (state.content || []).map(async (p) => {
        if (p.image) {
          try {
            const adapter = await this._storageService.getLocalAdapterForOrg(state.orgId, true);
            const upload = await adapter.uploadSimple(p.image);
            const name = upload.split('/').pop()!;
            const uploadWithId = await this._fileService.saveFile(
              state.orgId,
              name,
              upload
            );

            return {
              ...p,
              image: uploadWithId,
            };
          } catch (err) {
            this._logger.error(`Failed to upload picture: ${err}`);
            return p;
          }
        }

        return p;
      })
    );

    return { content: all };
  }

  async isGeneratePicture(state: WorkflowChannelsState) {
    if (state.isPicture) {
      return 'generate-picture';
    }

    return 'post-time';
  }

  async postDateTime(state: WorkflowChannelsState) {
    return { date: await this._postsService.findFreeDateTime(state.orgId) };
  }

  start(orgId: string, body: GeneratorDto) {
    const state = AgentGraphService.state();
    const workflow = state
      .addNode('agent', this.startCall.bind(this))
      .addNode('research', toolNode)
      .addNode('save-research', this.saveResearch.bind(this))
      .addNode('find-category', this.findCategories.bind(this))
      .addNode('find-topic', this.findTopic.bind(this))
      .addNode('find-popular-posts', this.findPopularPosts.bind(this))
      .addNode('generate-hook', this.generateHook.bind(this))
      .addNode('generate-content', this.generateContent.bind(this))
      .addNode('generate-content-fix', this.fixArray.bind(this))
      .addNode('generate-picture', this.generatePictures.bind(this))
      .addNode('upload-pictures', this.uploadPictures.bind(this))
      .addNode('post-time', this.postDateTime.bind(this))
      .addEdge(START, 'agent')
      .addEdge('agent', 'research')
      .addEdge('research', 'save-research')
      .addEdge('save-research', 'find-category')
      .addEdge('find-category', 'find-topic')
      .addEdge('find-topic', 'find-popular-posts')
      .addEdge('find-popular-posts', 'generate-hook')
      .addEdge('generate-hook', 'generate-content')
      .addEdge('generate-content', 'generate-content-fix')
      .addConditionalEdges(
        'generate-content-fix',
        this.isGeneratePicture.bind(this)
      )
      .addEdge('generate-picture', 'upload-pictures')
      .addEdge('upload-pictures', 'post-time')
      .addEdge('post-time', END);

    const app = workflow.compile();

    return app.streamEvents(
      {
        messages: [new HumanMessage(body.research)],
        isPicture: body.isPicture,
        format: body.format,
        tone: body.tone,
        orgId,
      },
      {
        streamMode: 'values',
        version: 'v2',
      }
    );
  }
}
