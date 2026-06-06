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
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/components/analytics-v2/**/*.spec.{ts,tsx}',
      'src/components/launches/post-detail/*.spec.{ts,tsx}',
      'src/components/launches/calendar.spec.{ts,tsx}',
      'src/components/ai/**/*.spec.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'src/components/analytics-v2/**/*.{ts,tsx}',
        'src/components/admin/ai-settings.component.tsx',
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
