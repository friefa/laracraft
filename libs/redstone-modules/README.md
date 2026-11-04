# redstone-modules

Tested redstone circuit modules (Java Edition blockstates) for Lara's `insertModule` and the editor.

- Contract: `src/lib/types.ts` (`RedstoneModule`, ports, params, behaviour spec, editions).
- Catalogue: `MODULE_CATALOGUE.get(id)` / `.all()`, `modulesForEdition('java' | 'bedrock')`.
- Texts: `src/i18n/{de,en}.json` (keys `redstoneModule.<id>.name|description|port.*|param.*`).

`pnpm exec nx test redstone-modules` checks structure, rotation, params, i18n and buildability
(every module in all four facings is planned and validated by `@laracraft/build-order`).
