import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gitroom/backend': path.resolve(__dirname, 'src'),
      '@gitroom/nestjs-libraries': path.resolve(__dirname, '../../libraries/nestjs-libraries/src'),
      '@gitroom/helpers': path.resolve(__dirname, '../../libraries/helpers/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    pool: 'threads',
    maxWorkers: 1,
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/api/routes/channel.config.controller.ts',
        'src/api/routes/analytics.v2.controller.ts',
        'src/api/routes/ai-settings.controller.ts',
        'src/api/routes/ai-user.controller.ts',
        'src/api/routes/ai-moderate.controller.ts',
        'src/api/routes/copilot.controller.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
