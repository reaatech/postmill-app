import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderCredentialLinkService } from './provider-credential-link.service';

function makeService() {
  const mediaRepository = { upsert: vi.fn().mockResolvedValue({}) };
  const aiRepository = { upsert: vi.fn().mockResolvedValue({}) };
  const encryption = { encrypt: vi.fn((v: string) => `enc(${v})`) };
  const service = new ProviderCredentialLinkService(
    mediaRepository as never,
    aiRepository as never,
    encryption as never,
  );
  return { service, mediaRepository, aiRepository, encryption };
}

describe('ProviderCredentialLinkService (§11.4 auto-config live-link)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks only openai and minimax as linked', () => {
    const { service } = makeService();
    expect(service.isLinked('openai')).toBe(true);
    expect(service.isLinked('minimax')).toBe(true);
    expect(service.isLinked('anthropic')).toBe(false);
    expect(service.isLinked('luma')).toBe(false);
  });

  it('mirrors AI credentials onto the media config (encrypted) for linked providers', async () => {
    const { service, mediaRepository } = makeService();
    await service.syncFromAiProvider('org-1', 'openai', { apiKey: 'sk-123' });

    expect(mediaRepository.upsert).toHaveBeenCalledWith('org-1', 'openai', {
      enabled: true,
      credentials: `enc(${JSON.stringify({ apiKey: 'sk-123' })})`,
    });
  });

  it('does not touch the media row\'s storage binding (only credentials/enabled)', async () => {
    const { service, mediaRepository } = makeService();
    await service.syncFromAiProvider('org-1', 'minimax', { apiKey: 'mm-key' });
    const data = mediaRepository.upsert.mock.calls[0][2];
    expect(Object.keys(data).sort()).toEqual(['credentials', 'enabled']);
  });

  it('mirrors media credentials onto the AI config (encrypted) for linked providers', async () => {
    const { service, aiRepository } = makeService();
    await service.syncFromMediaProvider('org-1', 'minimax', { apiKey: 'mm-key' });

    expect(aiRepository.upsert).toHaveBeenCalledWith('org-1', 'minimax', {
      enabled: true,
      credentials: `enc(${JSON.stringify({ apiKey: 'mm-key' })})`,
    });
  });

  it('ignores non-linked providers in both directions', async () => {
    const { service, mediaRepository, aiRepository } = makeService();
    await service.syncFromAiProvider('org-1', 'anthropic', { apiKey: 'x' });
    await service.syncFromMediaProvider('org-1', 'heygen', { apiKey: 'x' });
    expect(mediaRepository.upsert).not.toHaveBeenCalled();
    expect(aiRepository.upsert).not.toHaveBeenCalled();
  });

  it('is non-fatal when the mirror write fails', async () => {
    const { service, mediaRepository, aiRepository } = makeService();
    mediaRepository.upsert.mockRejectedValue(new Error('db down'));
    aiRepository.upsert.mockRejectedValue(new Error('db down'));

    await expect(service.syncFromAiProvider('org-1', 'openai', { apiKey: 'k' })).resolves.toBeUndefined();
    await expect(service.syncFromMediaProvider('org-1', 'openai', { apiKey: 'k' })).resolves.toBeUndefined();
  });
});
