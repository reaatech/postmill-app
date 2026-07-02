import { describe, it } from 'vitest';
import { runDomainConformance } from '@gitroom/provider-kernel';
import defaultModules from '../..';

describe('x provider conformance', () => {
  it('social module conforms', () => {
    const social = defaultModules.find((m) => m.manifest.domain === 'social');
    expect(social).toBeDefined();
    runDomainConformance('social', social!, {
      requiredMethods: [
        'post',
        'authenticate',
        'refreshToken',
        'generateAuthUrl',
        'maxLength',
        'checkValidity',
        'mentionFormat',
        'fetchPageInformation',
        'externalUrl',
        'analytics',
        'postAnalytics',
        'changeNickname',
        'changeProfilePicture',
        'missing',
        'comment',
        'fetchComments',
        'replyToComment',
        'likeComment',
        'mention',
      ],
    });
  });
});
