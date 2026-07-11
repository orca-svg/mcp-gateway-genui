import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readDoc(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('public API documentation', () => {
  const nonEligibilityDisclaimer =
    'Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.';

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

  it('keeps non-eligibility disclaimer wording identical across docs and tool caveats', () => {
    const docs = [
      'README.md',
      'packages/schema/README.md',
      'packages/core/README.md',
      'packages/mcp-server/README.md',
      'docs/host-prompts.md',
      'packages/core/src/tool-service.ts'
    ];

    for (const doc of docs) {
      expect(readDoc(doc), `${doc} should contain the shared disclaimer`).toContain(
        nonEligibilityDisclaimer
      );
    }
  });

  it('documents public data source attribution and security response windows', () => {
    const dataSources = readDoc('docs/data-sources.md');
    const security = readDoc('SECURITY.md');

    expect(dataSources).toContain('서울 청년 월세 지원');
    expect(dataSources).toContain('국가장학금');
    expect(dataSources).toContain('국민취업지원제도');
    expect(dataSources).toContain('공공누리');
    expect(dataSources).toContain('links[]');
    expect(dataSources).toContain('field-level provenance');
    expect(security).toContain('within 72 hours');
    expect(security).toContain('within 14 days');
  });
});
