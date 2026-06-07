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
    expect(workflow).toContain('changesets/action');
    expect(workflow).toContain('pnpm publish -r --provenance');
    expect(workflow).toContain('pnpm build');
    expect(workflow).toContain('pnpm typecheck');
    expect(workflow).toContain('pnpm test');
  });
});
