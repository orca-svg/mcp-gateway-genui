import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const publishablePackages = [
  { name: 'schema', directory: 'packages/schema', sideEffects: false, files: ['dist', 'schema', 'fixtures'] },
  { name: 'core', directory: 'packages/core', sideEffects: false, files: ['dist'] },
  { name: 'adapters', directory: 'packages/adapters', sideEffects: false, files: ['dist'] },
  { name: 'mcp-server', directory: 'packages/mcp-server', hasBin: true, files: ['dist'] },
] as const;

function readPackageJson(directory: string) {
  return JSON.parse(readFileSync(join(repoRoot, directory, 'package.json'), 'utf8')) as Record<string, unknown>;
}

describe('publishable package metadata', () => {
  it('keeps the root and demo app private', () => {
    expect(readPackageJson('.').private).toBe(true);
    expect(readPackageJson('apps/demo-ui').private).toBe(true);
  });

  it('declares complete public npm metadata for each publishable package', () => {
    for (const pkg of publishablePackages) {
      const packageJson = readPackageJson(pkg.directory);

      expect(packageJson.license).toBe('Apache-2.0');
      expect(packageJson.description).toEqual(expect.any(String));
      expect(packageJson.author).toEqual(expect.any(String));
      expect(packageJson.repository).toMatchObject({
        type: 'git',
        url: 'git+https://github.com/orca-svg/mcp-gateway-genui.git',
        directory: pkg.directory,
      });
      expect(packageJson.homepage).toBe('https://github.com/orca-svg/mcp-gateway-genui#readme');
      expect(packageJson.bugs).toMatchObject({
        url: 'https://github.com/orca-svg/mcp-gateway-genui/issues',
      });
      expect(packageJson.files).toEqual(pkg.files);
      expect(packageJson.publishConfig).toEqual({ access: 'public', provenance: true });
      expect(existsSync(join(repoRoot, pkg.directory, 'README.md'))).toBe(true);

      if ('sideEffects' in pkg) {
        expect(packageJson.sideEffects).toBe(pkg.sideEffects);
      }
      if ('hasBin' in pkg) {
        expect(packageJson.bin).toMatchObject({ 'mcp-gen-ui-gateway': './dist/index.js' });
      }
    }
  });
});
