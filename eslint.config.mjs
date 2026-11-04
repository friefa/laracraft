import nx from '@nx/eslint-plugin';

/**
 * Module boundaries encode the architecture (see docs/ARCHITECTURE.md):
 *  - type:engine libs are pure TypeScript: no DOM, no three.js, no Angular.
 *  - scope:shared libs may be used by client and backend tooling.
 */
export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/.local-textures',
      '**/out-tsc',
      '**/coverage',
      '**/android',
      '**/ios',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'type:engine', onlyDependOnLibsWithTags: ['type:engine'] },
            {
              sourceTag: 'type:render',
              onlyDependOnLibsWithTags: ['type:engine', 'type:render'],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: ['type:engine', 'type:render', 'type:feature'],
            },
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'type:tool', onlyDependOnLibsWithTags: ['type:engine', 'type:tool'] },
          ],
        },
      ],
    },
  },
  {
    // Engine libs must stay UI-free so they run in Web Workers and in Node.
    files: [
      'libs/core-model/**/*.ts',
      'libs/build-order/**/*.ts',
      'libs/lara-dsl/**/*.ts',
      'libs/redstone-modules/**/*.ts',
      'libs/formats/**/*.ts',
      'libs/editor/**/*.ts',
      'libs/redstone-sim/**/*.ts',
      'libs/renderer/src/lib/mesh/**/*.ts',
      'libs/renderer/src/lib/models/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'Engine libs must not depend on three.js.' },
            { group: ['@angular/*'], message: 'Engine libs must not depend on Angular.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
];
