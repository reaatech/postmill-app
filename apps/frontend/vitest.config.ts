import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gitroom/helpers': path.resolve(__dirname, '../../libraries/helpers/src'),
      '@gitroom/react': path.resolve(__dirname, '../../libraries/react-shared-libraries/src'),
      '@gitroom/frontend': path.resolve(__dirname, 'src'),
      '@gitroom/nestjs-libraries': path.resolve(__dirname, '../../libraries/nestjs-libraries/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
    include: [
      'src/components/analytics-v2/**/*.spec.{ts,tsx}',
      'src/components/launches/post-detail/*.spec.{ts,tsx}',
      'src/components/launches/calendar.spec.{ts,tsx}',
      'src/components/launches/calendar/**/*.spec.{ts,tsx}',
      'src/components/dashboard/**/*.spec.{ts,tsx}',
      'src/components/settings/media-providers/**/*.spec.{ts,tsx}',
      'src/components/ai/**/*.spec.{ts,tsx}',
      'src/components/settings/shortlinks/**/*.spec.{ts,tsx}',
      'src/components/settings/vpn/**/*.spec.{ts,tsx}',
      'src/components/layout/settings.component.spec.{ts,tsx}',
      'src/components/layout/use-permissions.spec.{ts,tsx}',
      'src/components/layout/top.menu.spec.{ts,tsx}',
      'src/components/settings/roles/**/*.spec.{ts,tsx}',
      'src/components/new-layout/layout.component.spec.{ts,tsx}',
      'src/components/media-tools/designer/*.spec.{ts,tsx}',
      'src/redirects.config.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'src/components/analytics-v2/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/components/analytics-v2/charts/*.tsx',
      ],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 65,
        lines: 95,
      },
    },
  },
});
