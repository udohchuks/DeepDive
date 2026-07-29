import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
    alias: {
      '@deepdive/core': path.resolve(__dirname, './packages/core/src'),
      '@deepdive/storage': path.resolve(__dirname, './packages/storage/src'),
      '@deepdive/sandbox': path.resolve(__dirname, './packages/sandbox/src'),
      '@deepdive/provider': path.resolve(__dirname, './packages/provider/src'),
      '@deepdive/agent': path.resolve(__dirname, './packages/agent/src'),
      '@deepdive/vcs': path.resolve(__dirname, './packages/vcs/src'),
      '@deepdive/content': path.resolve(__dirname, './packages/content/src'),
      '@deepdive/engine': path.resolve(__dirname, './packages/engine/src'),
      '@deepdive/greenfield': path.resolve(__dirname, './packages/greenfield/src'),
      '@deepdive/onboarding': path.resolve(__dirname, './packages/onboarding/src'),
    },
  },
});
