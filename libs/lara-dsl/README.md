# lara-dsl

Lara's build-operation DSL (M3): contract (`src/lib/types.ts`, lead-owned), JSON Schema and tool
definitions (`src/lib/schema`), validator (`src/lib/validate`) and interpreter
(`src/lib/interpreter`).

- `LARA_TOOLS`: one strict-compatible tool per operation, `validateToolCall` / `validateOperation`
  return structured `DslError`s for the model.
- `applyOperations` (batch, all-or-nothing) and `createLaraTurn` (streaming accumulator) produce
  one `ChangeSet` per Lara turn.
- Generated files in `schema/` (`lara-dsl.schema.json`, `lara-tools.json`) are used by the backend.
  Regenerate with `pnpm exec nx run lara-dsl:schema`; a unit test and `lara-dsl:schema-check` fail
  when they are stale.

Run `pnpm exec nx test lara-dsl` for the unit and property-based tests.
