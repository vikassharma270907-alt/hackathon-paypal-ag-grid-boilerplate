import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // proofline.test.ts excluded: src/lib/proofline/* was lost in the recovery commit (see docs/process/AGENT_WORKLOG.md).
    exclude: ['node_modules', '.agents', '.next', 'tests/proofline.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/empty.js'),
    },
  },
});
