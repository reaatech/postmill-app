import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Array form so the relocated social providers (step 7.5.1) resolve to their
    // workspace SOURCE rather than the hoisted node_modules copies. Source-resolved
    // modules are transformed by vitest, so the specs' `vi.mock(...)` of shared
    // helpers (read.or.fetch, timer, etc.) intercepts the provider's direct imports.
    alias: [
      { find: '@gitroom/nestjs-libraries', replacement: path.resolve(__dirname, 'src') },
      { find: '@gitroom/helpers', replacement: path.resolve(__dirname, '../helpers/src') },
      { find: '@gitroom/backend', replacement: path.resolve(__dirname, '../../apps/backend/src') },
      { find: '@gitroom/provider-kernel', replacement: path.resolve(__dirname, '../providers/kernel/src') },
      { find: /^@gitroom\/provider-(.+)$/, replacement: path.resolve(__dirname, '../providers/$1/src') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    pool: 'threads',
    maxWorkers: 1,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/integrations/credentials.ts',
        'src/integrations/provider-config.manager.ts',
        'src/integrations/integration.manager.ts',
        'src/integrations/social.abstract.ts',
        'src/integrations/integration.missing.scopes.ts',
        'src/integrations/tool.decorator.ts',
        'src/integrations/refresh.integration.service.ts',
        'src/integrations/social/*.provider.ts',
        'src/database/prisma/provider-configs/provider-config.repository.ts',
        'src/database/prisma/provider-configs/provider-config.service.ts',
        'src/analytics/analytics.service.ts',
        'src/integrations/social/analytics.metrics.ts',
        'src/ai/*.ts',
        'src/ai/**/*.ts',
        'src/openai/openai.service.ts',
        'src/agent/agent.graph.service.ts',
        'src/database/prisma/ai-settings/*.ts',
        'src/database/prisma/ai-rag/*.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
