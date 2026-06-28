import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@gitroom/backend', replacement: path.resolve(__dirname, 'src') },
      { find: '@gitroom/nestjs-libraries', replacement: path.resolve(__dirname, '../../libraries/nestjs-libraries/src') },
      { find: '@gitroom/helpers', replacement: path.resolve(__dirname, '../../libraries/helpers/src') },
      // Resolve relocated provider packages + kernel to workspace source so all
      // workspaces share a single kernel module instance (correct barrel init order;
      // avoids the "Rules is not a function" half-initialized-copy error when the
      // social registration module eagerly imports all 36 packages).
      { find: '@gitroom/provider-kernel', replacement: path.resolve(__dirname, '../../libraries/providers/kernel/src') },
      { find: /^@gitroom\/provider-(.+)$/, replacement: path.resolve(__dirname, '../../libraries/providers/$1/src') },
    ],
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
