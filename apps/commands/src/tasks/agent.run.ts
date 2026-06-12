import { Command, Positional } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';

@Injectable()
export class AgentRun {
  constructor(private _agentGraphService: AgentGraphService) {}
  @Command({
    command: 'run:agent <org>',
    describe: 'Run the agent',
  })
  async agentRun(
    @Positional({
      name: 'org',
      describe: 'Organization id to run the agent for',
      type: 'string',
    })
    org: string
  ) {
    for await (const event of this._agentGraphService.start(org, {
      research: 'Write a short post about scheduling social media content',
      isPicture: false,
      format: 'one_short',
      tone: 'company',
    })) {
      console.log(event);
    }
  }
}
