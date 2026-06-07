import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readDoc(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('public API documentation', () => {
  it('documents published packages, stable APIs, embed setup, and 0.x semver policy', () => {
    const readme = readDoc('README.md');
    const contributing = readDoc('CONTRIBUTING.md');

    expect(readme).toContain('## Public API');
    expect(readme).toContain('@mcp-gen-ui/schema');
    expect(readme).toContain('@mcp-gen-ui/core');
    expect(readme).toContain('@mcp-gen-ui/mcp-server');
    expect(readme).toContain('BenefitRepository');
    expect(readme).toContain('BenefitToolService');
    expect(readme).toContain('SnapshotStore');
    expect(readme).toContain('Zod');
    expect(readme).toContain('JSON Schema');
    expect(readme).toContain('fixtureBenefits');
    expect(readme).toContain('pnpm add @mcp-gen-ui/core');
    expect(readme).toContain('[`docs/extending.md`](docs/extending.md)');
    expect(readme).toMatch(/0\.x[\s\S]*minor[\s\S]*break/i);
    expect(contributing).toMatch(/0\.x[\s\S]*minor[\s\S]*break/i);
  });

  it('records the G-2 OSS library milestone in roadmap and changelog', () => {
    expect(readDoc('docs/roadmap.md')).toContain('G-2');
    expect(readDoc('CHANGELOG.md')).toContain('G-2');
  });
});
