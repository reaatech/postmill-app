import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { AgentDigestActivity } from '@gitroom/nestjs-libraries/inngest/activities/agent-digest.activity';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';

export const createAgentDigest = (
  agentDigestActivity: AgentDigestActivity,
  organizationRepository: OrganizationRepository
) =>
  inngest.createFunction(
    { id: 'agent-digest', concurrency: 1 },
    { cron: 'TZ=America/New_York 0 7 * * 1' },
    async ({ step }) => {
      if (process.env.AGENT_DIGEST_ENABLED !== 'true') {
        return { skipped: true, reason: 'AGENT_DIGEST_ENABLED not set to true' };
      }

      const orgIds = await step.run('get-org-ids', () =>
        organizationRepository.getAllIds().then((rows) => rows.map((r) => r.id))
      );

      if (orgIds.length > 0) {
        await step.sendEvent(
          'fan-out-agent-digest',
          orgIds.map((organizationId) => ({
            name: 'agent/digest-org' as const,
            data: { organizationId },
          }))
        );
      }

      return { fannedOut: orgIds.length };
    }
  );

export const createAgentDigestOrg = (agentDigestActivity: AgentDigestActivity) =>
  inngest.createFunction(
    { id: 'agent-digest-org', concurrency: 2 },
    { event: 'agent/digest-org' },
    async ({ step, event }) => {
      const { organizationId } = event.data;

      return step.run('run-agent-digest', () =>
        agentDigestActivity.run(organizationId)
      );
    }
  );
