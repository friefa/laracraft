/**
 * Independent Java Edition behaviour scenarios for the redstone simulator and the runner
 * that checks a `CreateSimulationFn` against them. Test-only entry point; not exported
 * from the library's main index.
 */
export * from './run-scenario';
export * from './scenarios/index';
export type { ScenarioBlock } from './scenarios/helpers';
