import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CI_FORBIDDEN_PATHS, checkNoLocalTextures } from './guard';

const WORKSPACE = resolve(import.meta.dirname, '../../../..');

describe('checkNoLocalTextures', () => {
  let root: string;
  const put = (path: string, content = '') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const atlasJson = (extra: object = {}) =>
    JSON.stringify({ version: 1, image: 'atlas.png', ...extra, textures: {} });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lc-guard-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('passes a normal atlas and missing folders', () => {
    put('dist/assets/textures/atlas.json', atlasJson());
    put('dist/assets/textures/atlas.png', 'png');
    expect(checkNoLocalTextures({ root, dirs: ['dist/assets/textures', 'nope'] })).toEqual([]);
  });

  it('fails on an atlas marked "local": true anywhere below the scanned folder', () => {
    put('dist/apps/laracraft/assets/textures/atlas.json', atlasJson({ local: true }));
    expect(checkNoLocalTextures({ root, dirs: ['dist/apps/laracraft'] })).toEqual([
      expect.stringMatching(/assets\/textures\/atlas\.json: .*"local": true/),
    ]);
  });

  it('fails on local texture folders inside the scanned folder', () => {
    put('dist/textures-local/atlas.png');
    put('dist/x/.local-textures/stone.png');
    const problems = checkNoLocalTextures({ root, dirs: ['dist'] });
    expect(problems).toContain('dist/textures-local: local texture path');
    expect(problems).toContain('dist/x/.local-textures: local texture path');
  });

  it('ignores unparsable atlas.json files', () => {
    put('dist/atlas.json', '{');
    expect(checkNoLocalTextures({ root, dirs: ['dist'] })).toEqual([]);
  });

  it('fails in strict mode when the local env switch is set', () => {
    const env = { LARACRAFT_LOCAL_TEXTURES: '1' };
    expect(checkNoLocalTextures({ root, dirs: [], env })).toEqual([]);
    expect(checkNoLocalTextures({ root, dirs: [], env, strict: true })).toEqual([
      expect.stringMatching(/LARACRAFT_LOCAL_TEXTURES is set/),
    ]);
  });

  it('fails in CI mode when local folders exist at all', () => {
    expect(checkNoLocalTextures({ root, dirs: [], forbidPaths: CI_FORBIDDEN_PATHS })).toEqual([]);
    put('.local-textures/stone.png');
    put('dist/assets/textures-local/atlas.json', atlasJson({ local: true }));
    expect(checkNoLocalTextures({ root, dirs: [], forbidPaths: CI_FORBIDDEN_PATHS })).toEqual([
      '.local-textures exists; local textures must not be here',
      'dist/assets/textures-local exists; local textures must not be here',
    ]);
  });
});

interface Target {
  cache?: boolean;
  dependsOn?: unknown[];
  options?: { command?: string };
  configurations?: Record<string, unknown>;
}

describe('guard wiring', () => {
  const read = (p: string) => readFileSync(join(WORKSPACE, p), 'utf8');
  const app = JSON.parse(read('apps/laracraft/project.json')) as {
    targets: Record<string, Target>;
  };
  const textures = JSON.parse(read('tools/textures/project.json')) as {
    targets: Record<string, Target>;
  };

  it('runs before every laracraft build, strict unless the local-textures dev configuration', () => {
    expect(app.targets['build']?.dependsOn).toContain('textures:guard-no-local');
    const guard = textures.targets['guard-no-local'];
    expect(guard?.options?.command).toMatch(/guard --strict /);
    expect(Object.keys(guard?.configurations ?? {})).toEqual(['local-textures']);
    expect(Object.keys(app.targets['build']?.configurations ?? {})).toContain('local-textures');
  });

  it('checks the web output strictly before cap sync', () => {
    const command = app.targets['cap-sync']?.options?.command ?? '';
    expect(command).toMatch(/cli\.ts guard --strict --dir dist\/apps\/laracraft && cap sync$/);
  });

  it('never caches local mode outputs', () => {
    expect(textures.targets['atlas']?.cache).toBe(false);
    expect(textures.targets['import-local']?.cache).not.toBe(true);
  });

  it('keeps local folders out of git, prettier and eslint', () => {
    expect(read('.gitignore')).toMatch(/^\/\.local-textures$/m);
    expect(read('.prettierignore')).toMatch(/^\/\.local-textures$/m);
    expect(read('eslint.config.mjs')).toContain("'**/.local-textures'");
  });

  it('has a CI step', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/cli\.ts guard --ci/);
  });
});
