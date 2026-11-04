/**
 * Generates the block display names `public/i18n/blocks/{en,de}.json` from the
 * Java block registry. Keys are `blocks.<path>` (id without `minecraft:`), see
 * `blockNameKey` in `src/app/editor/palette/palette-model.ts`.
 *
 *   pnpm exec nx run laracraft:block-names         # write
 *   pnpm exec nx run laracraft:block-names:check   # verify only
 *
 * English names are derived from the ids (plus a few overrides); German names
 * follow the official German Minecraft names. The script fails when a registry
 * block has no German name, so new blocks must be added here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJavaBlockRegistry } from '@laracraft/core-model';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/i18n/blocks');

// --- English -----------------------------------------------------------------

const EN_OVERRIDES: Record<string, string> = {
  tnt: 'TNT',
  repeater: 'Redstone Repeater',
  comparator: 'Redstone Comparator',
  redstone_wire: 'Redstone Wire',
  quartz_block: 'Block of Quartz',
  iron_block: 'Block of Iron',
  gold_block: 'Block of Gold',
  diamond_block: 'Block of Diamond',
  redstone_block: 'Block of Redstone',
  moving_piston: 'Moving Piston',
};

function englishName(path: string): string {
  return (
    EN_OVERRIDES[path] ??
    path
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

// --- German ------------------------------------------------------------------

const DE_BASE: Record<string, string> = {
  air: 'Luft',
  cave_air: 'Höhlenluft',
  void_air: 'Leerenluft',
  moving_piston: 'Bewegter Kolben',
  dirt: 'Erde',
  coarse_dirt: 'Grobe Erde',
  grass_block: 'Grasblock',
  sand: 'Sand',
  red_sand: 'Roter Sand',
  gravel: 'Kies',
  clay: 'Ton',
  snow_block: 'Schneeblock',
  ice: 'Eis',
  stone: 'Stein',
  cobblestone: 'Bruchstein',
  mossy_cobblestone: 'Bemooster Bruchstein',
  stone_bricks: 'Steinziegel',
  mossy_stone_bricks: 'Bemooste Steinziegel',
  cracked_stone_bricks: 'Rissige Steinziegel',
  chiseled_stone_bricks: 'Gemeißelte Steinziegel',
  smooth_stone: 'Glatter Stein',
  andesite: 'Andesit',
  polished_andesite: 'Polierter Andesit',
  diorite: 'Diorit',
  polished_diorite: 'Polierter Diorit',
  granite: 'Granit',
  polished_granite: 'Polierter Granit',
  deepslate: 'Tiefenschiefer',
  cobbled_deepslate: 'Bruchtiefenschiefer',
  polished_deepslate: 'Polierter Tiefenschiefer',
  deepslate_bricks: 'Tiefenschieferziegel',
  deepslate_tiles: 'Tiefenschieferfliesen',
  bricks: 'Ziegelsteine',
  sandstone: 'Sandstein',
  smooth_sandstone: 'Glatter Sandstein',
  cut_sandstone: 'Geschnittener Sandstein',
  chiseled_sandstone: 'Gemeißelter Sandstein',
  quartz_block: 'Quarzblock',
  obsidian: 'Obsidian',
  stone_stairs: 'Steintreppe',
  stone_slab: 'Steinstufe',
  smooth_stone_slab: 'Glatte Steinstufe',
  cobblestone_stairs: 'Bruchsteintreppe',
  cobblestone_slab: 'Bruchsteinstufe',
  cobblestone_wall: 'Bruchsteinmauer',
  stone_brick_stairs: 'Steinziegeltreppe',
  stone_brick_slab: 'Steinziegelstufe',
  stone_brick_wall: 'Steinziegelmauer',
  cobbled_deepslate_stairs: 'Bruchtiefenschiefertreppe',
  cobbled_deepslate_slab: 'Bruchtiefenschieferstufe',
  cobbled_deepslate_wall: 'Bruchtiefenschiefermauer',
  brick_stairs: 'Ziegeltreppe',
  brick_slab: 'Ziegelstufe',
  brick_wall: 'Ziegelmauer',
  sandstone_stairs: 'Sandsteintreppe',
  sandstone_slab: 'Sandsteinstufe',
  sandstone_wall: 'Sandsteinmauer',
  quartz_stairs: 'Quarztreppe',
  quartz_slab: 'Quarzstufe',
  terracotta: 'Keramik',
  glass: 'Glas',
  glass_pane: 'Glasscheibe',
  bookshelf: 'Bücherregal',
  crafting_table: 'Werkbank',
  furnace: 'Ofen',
  chest: 'Truhe',
  barrel: 'Fass',
  ladder: 'Leiter',
  iron_bars: 'Eisengitter',
  iron_block: 'Eisenblock',
  gold_block: 'Goldblock',
  diamond_block: 'Diamantblock',
  torch: 'Fackel',
  wall_torch: 'Wandfackel',
  lantern: 'Laterne',
  glowstone: 'Leuchtstein',
  sea_lantern: 'Seelaterne',
  water: 'Wasser',
  lava: 'Lava',
  redstone_wire: 'Redstone-Leitung',
  redstone_torch: 'Redstone-Fackel',
  redstone_wall_torch: 'Redstone-Wandfackel',
  redstone_block: 'Redstone-Block',
  lever: 'Hebel',
  stone_button: 'Steinknopf',
  stone_pressure_plate: 'Steindruckplatte',
  repeater: 'Redstone-Verstärker',
  comparator: 'Redstone-Komparator',
  piston: 'Kolben',
  sticky_piston: 'Klebriger Kolben',
  piston_head: 'Kolbenkopf',
  observer: 'Beobachter',
  dispenser: 'Werfer',
  dropper: 'Spender',
  hopper: 'Trichter',
  redstone_lamp: 'Redstone-Lampe',
  note_block: 'Notenblock',
  target: 'Zielblock',
  daylight_detector: 'Tageslichtsensor',
  tnt: 'TNT',
  slime_block: 'Schleimblock',
  honey_block: 'Honigblock',
  rail: 'Schiene',
  powered_rail: 'Antriebsschiene',
  detector_rail: 'Sensorschiene',
  activator_rail: 'Aktivierungsschiene',
  iron_door: 'Eisentür',
  iron_trapdoor: 'Eisenfalltür',
};

/** Wood families: [log, leaves, prefix of "…holz" items]. */
const DE_WOOD: Record<string, { log: string; leaves: string; wood: string }> = {
  oak: { log: 'Eichenstamm', leaves: 'Eichenlaub', wood: 'Eichenholz' },
  spruce: { log: 'Fichtenstamm', leaves: 'Fichtennadeln', wood: 'Fichtenholz' },
  birch: { log: 'Birkenstamm', leaves: 'Birkenlaub', wood: 'Birkenholz' },
  dark_oak: { log: 'Schwarzeichenstamm', leaves: 'Schwarzeichenlaub', wood: 'Schwarzeichenholz' },
  jungle: { log: 'Tropenbaumstamm', leaves: 'Tropenbaumlaub', wood: 'Tropenholz' },
  acacia: { log: 'Akazienstamm', leaves: 'Akazienlaub', wood: 'Akazienholz' },
  mangrove: { log: 'Mangrovenstamm', leaves: 'Mangrovenlaub', wood: 'Mangrovenholz' },
  cherry: { log: 'Kirschstamm', leaves: 'Kirschlaub', wood: 'Kirschholz' },
};

const DE_WOOD_ITEMS: Record<string, string> = {
  planks: 'bretter',
  stairs: 'treppe',
  slab: 'stufe',
  fence: 'zaun',
  fence_gate: 'zauntor',
  door: 'tür',
  trapdoor: 'falltür',
  button: 'knopf',
  pressure_plate: 'druckplatte',
};

/** Colour adjective stem; the ending depends on the noun's gender. */
const DE_COLORS: Record<string, string> = {
  white: 'weiß',
  light_gray: 'hellgrau',
  gray: 'grau',
  black: 'schwarz',
  red: 'rot',
  blue: 'blau',
  yellow: 'gelb',
  green: 'grün',
  light_blue: 'hellblau',
  orange: 'orange',
  magenta: 'magenta',
  lime: 'hellgrün',
  pink: 'rosa',
  cyan: 'türkis',
  purple: 'violett',
  brown: 'braun',
};

type Gender = 'f' | 'm' | 'n';
const DE_COLORED_ITEMS: Record<string, { noun: string; gender: Gender }> = {
  wool: { noun: 'Wolle', gender: 'f' },
  wool_stairs: { noun: 'Wolltreppe', gender: 'f' },
  wool_slab: { noun: 'Wollstufe', gender: 'f' },
  carpet: { noun: 'Teppich', gender: 'm' },
  concrete: { noun: 'Beton', gender: 'm' },
  concrete_stairs: { noun: 'Betontreppe', gender: 'f' },
  concrete_slab: { noun: 'Betonstufe', gender: 'f' },
  concrete_powder: { noun: 'Trockenbeton', gender: 'm' },
  terracotta: { noun: 'Keramik', gender: 'f' },
  stained_glass: { noun: 'Glas', gender: 'n' },
  stained_glass_pane: { noun: 'Glasscheibe', gender: 'f' },
};

const ENDING: Record<Gender, string> = { f: 'e', m: 'er', n: 'es' };
/** Colours that are not declined in German (e.g. "Rosa Wolle"). */
const INDECLINABLE = new Set(['rosa', 'orange', 'magenta']);

function colored(stem: string, gender: Gender, noun: string): string {
  const adjective = INDECLINABLE.has(stem) ? stem : stem + ENDING[gender];
  return `${adjective.charAt(0).toUpperCase()}${adjective.slice(1)} ${noun}`;
}

function germanName(path: string): string | undefined {
  const base = DE_BASE[path];
  if (base) return base;
  for (const [wood, names] of Object.entries(DE_WOOD)) {
    if (!path.startsWith(`${wood}_`)) continue;
    const rest = path.slice(wood.length + 1);
    if (rest === 'log') return names.log;
    if (rest === 'leaves') return names.leaves;
    const suffix = DE_WOOD_ITEMS[rest];
    if (suffix) return names.wood + suffix;
  }
  // Longest colour first so `light_gray` wins over `gray`.
  const colors = Object.keys(DE_COLORS).sort((a, b) => b.length - a.length);
  for (const color of colors) {
    if (!path.startsWith(`${color}_`)) continue;
    const item = DE_COLORED_ITEMS[path.slice(color.length + 1)];
    const stem = DE_COLORS[color];
    if (item && stem) return colored(stem, item.gender, item.noun);
  }
  return undefined;
}

// --- main --------------------------------------------------------------------

function main(): void {
  const check = process.argv.includes('--check');
  const en: Record<string, string> = {};
  const de: Record<string, string> = {};
  const missing: string[] = [];
  for (const def of createJavaBlockRegistry().all()) {
    const path = def.id.replace(/^minecraft:/, '');
    const key = path;
    en[key] = englishName(path);
    const german = germanName(path);
    if (german) de[key] = german;
    else missing.push(def.id);
  }
  if (missing.length) {
    throw new Error(`Missing German block names (add them to this script):\n${missing.join('\n')}`);
  }
  const sorted = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  let stale = false;
  for (const [lang, names] of [
    ['en', en],
    ['de', de],
  ] as const) {
    const file = resolve(OUT_DIR, `${lang}.json`);
    const content = `${JSON.stringify({ blocks: sorted(names) }, null, 2)}\n`;
    let current = '';
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      // New file.
    }
    if (current === content) continue;
    if (check) {
      console.error(`${file} is out of date; run the script without --check.`);
      stale = true;
    } else {
      writeFileSync(file, content);
      console.log(`Wrote ${file}`);
    }
  }
  if (stale) process.exitCode = 1;
}

main();
