import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Observer clock (Java): two observers watching each other, x -1..3, y 0..1, z = 0.
 *
 *   y=1   lamp  O→  ←O  piston→
 *   y=0   smooth stone floor
 *   x=    -1    0    1    2
 *
 * - (0,1,0) observer facing=east watches (1,1,0); its output (back) is west.
 * - (1,1,0) observer facing=west watches (0,1,0); its output (back) is east.
 * - (-1,1,0) redstone lamp behind the first observer, (2,1,0) piston facing=east
 *   behind the second one. An observer strongly powers the block behind it, so
 *   both blink with every pulse.
 *
 * The clock starts the moment the second observer is placed: the first one sees
 * that placement, pulses, the second sees the first change state, and so on.
 * One of the two observers is necessarily placed before the block it watches
 * (the validator allows that for a mutually facing pair only).
 *
 * Exercises: redstone-safety (observer order, mutual pair), orientation (3D
 * facing of observers: facing = look direction; piston: facing = opposite of look).
 */
export const OBSERVER_CLOCK: GoldenBuild = {
  name: 'observer-clock',
  description:
    'Two observers facing each other form a clock that blinks a redstone lamp and pushes a piston.',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'observer-clock', OBSERVER_CLOCK.description);
    b.fill(-1, 0, 0, 3, 0, 0, 'minecraft:smooth_stone');
    b.set(-1, 1, 0, 'minecraft:redstone_lamp[lit=false]');
    b.set(0, 1, 0, 'minecraft:observer[facing=east,powered=false]');
    b.set(1, 1, 0, 'minecraft:observer[facing=west,powered=false]');
    b.set(2, 1, 0, 'minecraft:piston[extended=false,facing=east]');
    return b.doc;
  },
};
