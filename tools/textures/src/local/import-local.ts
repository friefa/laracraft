/**
 * Local-only developer texture mode (Roadmap P1.11): extract the block textures
 * laracraft needs from the developer's OWN Minecraft Java Edition client.jar.
 *
 *   pnpm exec nx run textures:import-local -- --jar <path/to/client.jar>
 *
 * Reads only the PNGs named in VANILLA_TEXTURE_MAP and writes them (re-encoded,
 * pixels unchanged) to `.local-textures/<name>.png` at the workspace root. That
 * folder is git-ignored and never enters the manifest or the credits. Nothing is
 * downloaded: the jar must already exist on this machine.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { encodePng } from '../lib/png';
import { extractFromJar, LOCAL_README, LOCAL_TEXTURES_DIR } from './local-textures';

const ROOT = resolve(import.meta.dirname, '../../../..');

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function main(): void {
  const { values } = parseArgs({ options: { jar: { type: 'string' } } });
  if (!values.jar) die('usage: import-local.ts --jar <path to your Minecraft client.jar>');
  // Relative paths are resolved against the directory the command was started in.
  const jarPath = resolve(process.env['INIT_CWD'] ?? process.cwd(), values.jar);
  if (!existsSync(jarPath) || !statSync(jarPath).isFile()) die(`jar not found: ${jarPath}`);

  const { images, absent, rejected, versionId } = extractFromJar(readFileSync(jarPath));
  if (images.size === 0) die(`no usable block textures found in ${jarPath}`);

  const outDir = join(ROOT, LOCAL_TEXTURES_DIR);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  // Defence in depth: keep the folder out of git even if the root .gitignore changes.
  writeFileSync(join(outDir, '.gitignore'), '*\n');
  writeFileSync(join(outDir, 'README.txt'), LOCAL_README);
  for (const [name, image] of images) writeFileSync(join(outDir, `${name}.png`), encodePng(image));

  console.log(
    `Extracted ${images.size} texture(s)${versionId ? ` from Minecraft ${versionId}` : ''} ` +
      `into ${LOCAL_TEXTURES_DIR}/ (local only, git-ignored).`,
  );
  if (absent.length > 0) console.log(`Not in the jar (fallback to packs): ${absent.join(', ')}`);
  if (rejected.length > 0) console.log(`Skipped:\n  ${rejected.join('\n  ')}`);
  console.log('Next: pnpm exec nx run textures:atlas -- --local');
}

main();
