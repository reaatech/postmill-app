import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gitroom/nestjs-libraries': path.resolve(__dirname, 'src'),
      '@gitroom/helpers': path.resolve(__dirname, '../helpers/src'),
      '@gitroom/backend': path.resolve(__dirname, '../../apps/backend/src'),
    },
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
