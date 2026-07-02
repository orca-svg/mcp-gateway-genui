import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readJson(pathFromRoot: string) {
  return JSON.parse(readFileSync(join(repoRoot, pathFromRoot), 'utf8')) as Record<string, unknown>;
}

describe('release automation configuration', () => {
  it('configures Changesets for the linked public packages', () => {
    const rootPackageJson = readJson('package.json');
    const configPath = '.changeset/config.json';

    expect(rootPackageJson.devDependencies).toMatchObject({ '@changesets/cli': expect.any(String) });
    expect(existsSync(join(repoRoot, configPath))).toBe(true);

    const changesetConfig = readJson(configPath);
    expect(changesetConfig.access).toBe('public');
    expect(changesetConfig.baseBranch).toBe('main');
    expect(changesetConfig.linked).toContainEqual([
      '@mcp-gen-ui/schema',
      '@mcp-gen-ui/core',
      '@mcp-gen-ui/mcp-server',
    ]);
    expect(changesetConfig.ignore).toContain('@mcp-gen-ui/demo-ui');
  });

  it('publishes with npm provenance from the release workflow', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('NPM_TOKEN');
    // setup-node's registry-url .npmrc reads auth from NODE_AUTH_TOKEN and
    // shadows the .npmrc the changesets action writes, so the publish step
    // must forward the token under that name too.
    expect(workflow).toContain('NODE_AUTH_TOKEN');
    expect(workflow).toContain('changesets/action');
    // `changeset publish` (not `pnpm publish -r`) so the action sees the
    // "New tag:" output it needs to push tags and create GitHub releases.
    expect(workflow).toContain('publish: pnpm changeset publish');
    expect(workflow).toContain('pnpm build');
    expect(workflow).toContain('pnpm typecheck');
    expect(workflow).toContain('pnpm test');

    // With no --provenance flag on the publish command, provenance (and
    // public access) must come from each published package's publishConfig.
    for (const pkg of ['schema', 'core', 'mcp-server', 'adapters']) {
      const packageJson = readJson(`packages/${pkg}/package.json`);
      expect(packageJson.publishConfig, `packages/${pkg} publishConfig`).toMatchObject({
        access: 'public',
        provenance: true,
      });
    }
  });

  it('gates publishing behind the RELEASE_ENABLED go-live switch', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

    // The publish/version step must not run until the maintainer flips the
    // go-live switch, so nothing is published ahead of issue #5.
    expect(workflow).toMatch(/if:\s*\$\{\{\s*vars\.RELEASE_ENABLED == 'true'\s*\}\}/);
  });
});
