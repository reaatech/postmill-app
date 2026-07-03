import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = {
  upsert: vi.fn(),
  getActive: vi.fn(),
  getByOrg: vi.fn(),
  getByIdentifier: vi.fn(),
  setActive: vi.fn(),
};

const mockEncryption = {
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
};

const mockResolution = {
  resolveAI: vi.fn(),
};

const mockKernel = {
  listManifests: vi.fn(),
  latestActive: vi.fn(),
};

vi.mock('./org-ai-settings.repository', () => ({
  OrgAiSettingsRepository: vi.fn(() => mockRepo),
}));

vi.mock('@gitroom/nestjs-libraries/encryption/encryption.service', () => ({
  EncryptionService: vi.fn(() => mockEncryption),
}));

vi.mock('@gitroom/nestjs-libraries/providers/provider-resolution.service', () => ({
  ProviderResolutionService: vi.fn(() => mockResolution),
}));

vi.mock('@gitroom/nestjs-libraries/providers/providers.module', () => ({
  PROVIDER_KERNEL: 'PROVIDER_KERNEL',
}));

vi.mock('@gitroom/provider-kernel', () => ({
  ProviderKernel: vi.fn(),
  DEFAULT_VERSION: 'v1',
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/media-providers/provider-credential-link.service', () => ({
  ProviderCredentialLinkService: vi.fn(),
}));

import { OrgAiSettingsService } from './org-ai-settings.service';

describe('OrgAiSettingsService.upsert auto-activation', () => {
  let service: OrgAiSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrgAiSettingsService(
      mockRepo as any,
      mockEncryption as any,
      mockResolution as any,
      mockKernel as any,
      undefined
    );
  });

  it('auto-activates the org first-ever LLM provider (no configs yet)', async () => {
    mockRepo.getByOrg.mockResolvedValue([]); // no provider configured before this write
    mockRepo.upsert.mockResolvedValue({ id: 'cfg-1', identifier: 'openai', version: 'v1' });
    mockRepo.getByIdentifier.mockResolvedValue({
      id: 'cfg-1',
      identifier: 'openai',
      version: 'v1',
      credentials: 'enc:{"apiKey":"sk-test"}',
    });
    mockResolution.resolveAI.mockReturnValue({
      identifier: 'openai',
      credentialFields: [{ key: 'apiKey', required: true }],
    });

    await service.upsert('org-1', 'openai', { credentials: { apiKey: 'sk-test' } });

    expect(mockRepo.setActive).toHaveBeenCalledWith('org-1', 'openai', 'v1');
  });

  it('does not auto-activate on an established org (already has a configured provider)', async () => {
    // Anti-surprise: an org with any existing config (even none active) must never have a
    // Settings-flow re-save silently flip activation on.
    mockRepo.getByOrg.mockResolvedValue([
      { id: 'cfg-1', identifier: 'openai', isActive: false },
    ]);
    mockRepo.upsert.mockResolvedValue({ id: 'cfg-1', identifier: 'openai', version: 'v1' });
    mockResolution.resolveAI.mockReturnValue({
      identifier: 'openai',
      credentialFields: [{ key: 'apiKey', required: true }],
    });

    await service.upsert('org-1', 'openai', { credentials: { apiKey: 'sk-new' } });

    expect(mockRepo.setActive).not.toHaveBeenCalled();
  });

  it('does not steal primary when an active provider already exists', async () => {
    mockRepo.getByOrg.mockResolvedValue([
      { id: 'cfg-1', identifier: 'openai', isActive: true },
    ]);
    mockRepo.upsert.mockResolvedValue({ id: 'cfg-2', identifier: 'anthropic', version: 'v1' });

    await service.upsert('org-1', 'anthropic', { credentials: { apiKey: 'sk-test' } });

    expect(mockRepo.setActive).not.toHaveBeenCalled();
  });
});
