import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';

@Injectable()
export class AiEnvMigrationService implements OnModuleInit {
  private readonly _logger = new Logger(AiEnvMigrationService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _encryption: EncryptionService,
  ) {}

  async onModuleInit() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return;

    const orgs = await this._prisma.organization.findMany({
      select: { id: true },
    });

    if (orgs.length === 0) return;

    const encrypted = this._encryption.encrypt(JSON.stringify({ apiKey }));

    let seeded = 0;

    for (const org of orgs) {
      const existingCount = await this._prisma.aIOrgProviderConfig.count({
        where: { organizationId: org.id, identifier: 'openai' },
      });

      if (existingCount > 0) continue;

      await this._prisma.aIOrgProviderConfig.upsert({
        where: {
          organizationId_identifier: { organizationId: org.id, identifier: 'openai' },
        },
        create: {
          organizationId: org.id,
          identifier: 'openai',
          enabled: true,
          isActive: true,
          credentials: encrypted,
          defaultModel: 'gpt-4o',
          imageModel: 'dall-e-3',
        },
        update: {
          credentials: encrypted,
          enabled: true,
        },
      });
      seeded++;
    }

    if (seeded > 0) {
      this._logger.log(`Seeded OpenAI AI provider config from OPENAI_API_KEY env var for ${seeded} org(s)`);
    }
  }
}
