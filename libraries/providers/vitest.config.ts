import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gitroom/provider-kernel': path.resolve(__dirname, './kernel/src'),
      '@gitroom/nestjs-libraries': path.resolve(__dirname, '../nestjs-libraries/src'),
      '@gitroom/helpers': path.resolve(__dirname, '../helpers/src'),
      '@gitroom/backend': path.resolve(__dirname, '../../apps/backend/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      '*/src/**/*.spec.ts',
      '*/src/**/*.test.ts',
      '*/src/**/*.int-spec.ts',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      // Only instrument files actually loaded by tests — without this v8 would report
      // every untested adapter at 0% and sink the floor (70+ adapters still lack tests).
      all: false,
      include: [
        'kernel/src/**',
        // Adapters with B4 recorded-fixture integration tests.
        'wan/src/v1/media.adapter.ts',
        'higgsfield/src/v1/media.adapter.ts',
        'ltx/src/v1/media.adapter.ts',
        'reelfarm/src/v1/media.adapter.ts',
        'genviral/src/v1/media.adapter.ts',
        'openai/src/v1/media.adapter.ts',
        'google-ai/src/v1/media.adapter.ts',
        'leonardo/src/v1/media.adapter.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.int-spec.ts',
        '**/*.test.ts',
        // Legacy social-provider implementations relocated into the kernel package — these are
        // adapter logic (1000+-line base classes), not kernel framework, and are out of scope for
        // this floor. Tracked in PROVIDERS_INVENTORY.md backlog.
        'kernel/src/domains/social-families/**',
        'kernel/src/domains/social-dtos/**',
        'kernel/src/domains/social-base.ts',
        'kernel/src/domains/social-bridge.ts',
        'kernel/src/domains/social-provider.ts',
        'kernel/src/domains/social-capabilities.ts',
        'kernel/src/domains/social-credentials.ts',
        'kernel/src/domains/social-rules-decorator.ts',
        'kernel/src/domains/social-tool-decorator.ts',
        'kernel/src/domains/social-make-id.ts',
        // Legacy media/storage base-and-bridge modules (AI-SDK media bridge, storage base) — large
        // relocated helper classes the kit adapters do not extend; same backlog rationale.
        'kernel/src/domains/media-helpers.ts',
        'kernel/src/domains/storage-helpers.ts',
      ],
      thresholds: {
        statements: 70,
        lines: 70,
      },
    },
  },
});
