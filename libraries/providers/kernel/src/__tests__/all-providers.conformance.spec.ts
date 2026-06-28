import { describe, it } from 'vitest';
import { providerModules } from '@gitroom/backend/providers.generated';
import { runDomainConformance } from '../testing/conformance';

/**
 * Universal provider conformance gate (plan B2 + B3).
 *
 * B2: every registered module must have a valid manifest, matching domain, and a
 *     pure `create()` (no network at construction).
 * B3: the capability created by `module.create(ctx)` must expose every non-optional
 *     method of its domain interface (`kernel/src/domains/<domain>.ts`).
 *
 * `runDomainConformance` THROWS on failure (it does not register tests), so every
 * call is inside an `it()`. The social bridge re-exposes its legacy methods on the
 * created capability, so asserting on the created capability (what the helper does)
 * correctly covers social too — we never assert on `module.legacyProvider`.
 */

// Required (non-optional) methods per domain — verified against
// libraries/providers/kernel/src/domains/<domain>.ts.
const REQUIRED_METHODS: Record<string, string[]> = {
  social: ['post', 'generateAuthUrl', 'authenticate', 'maxLength', 'checkValidity'],
  media: ['generateImage', 'generateVideo', 'generateAudio', 'generateAvatar'],
  storage: [
    'uploadSimple',
    'removeFile',
    'readFile',
    'writeBuffer',
    'testConnection',
    'listFiles',
    'getFileUrl',
    'deleteFile',
    'getUsageBytes',
  ],
  shortlink: ['createShortLink', 'validateCredentials', 'resolveDomain'],
  ai: ['listModels', 'validateCredentials', 'createLanguageModel', 'createLangchainModel'],
  vpn: ['validateConfig'],
  contentpack: ['search', 'resolveDownload'],
  email: ['send', 'isConfigured'],
  auth: ['generateLink', 'getToken', 'getUser'],
};

describe.each(providerModules)(
  '$manifest.domain/$manifest.providerId@$manifest.version',
  (m) => {
    // B2 — manifest + create() purity + domain match + capability instantiation.
    it('passes manifest conformance', () => {
      runDomainConformance(m.manifest.domain, m, {}, {});
    });

    // B3 — required-method conformance on the CREATED capability.
    const requiredMethods = REQUIRED_METHODS[m.manifest.domain];
    if (requiredMethods) {
      it('implements all required domain methods', () => {
        runDomainConformance(m.manifest.domain, m, { requiredMethods }, {});
      });
    } else {
      it.fails(
        `has no required-method list for unknown domain "${m.manifest.domain}"`,
        () => {
          throw new Error(`unknown domain ${m.manifest.domain}`);
        },
      );
    }
  },
);
