import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/lara-agent',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'lara-agent',
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/lara-agent',
      provider: 'v8' as const,
    },
  },
}));
