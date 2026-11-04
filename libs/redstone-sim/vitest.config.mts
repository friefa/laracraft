import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/redstone-sim',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'redstone-sim',
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/redstone-sim',
      provider: 'v8' as const,
    },
  },
}));
