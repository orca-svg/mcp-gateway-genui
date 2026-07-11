import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BokjiroRepository,
  SubsidyRepository,
  YouthCenterRepository,
  type BenefitSourceAdapter,
} from '@mcp-gen-ui/adapters';
import {
  buildIssueTitle,
  classifyObservation,
  hasLiveFailure,
  type CanaryResult,
} from './checks.js';

interface SourceConfig {
  name: string;
  // First non-empty env var found in envKeys is used.
  envKeys: string[];
  createAdapter: (apiKey: string) => BenefitSourceAdapter;
}

const silentLogger = { warn: (_message: string) => undefined };
const boundedPageSize = 5;

const SOURCES: SourceConfig[] = [
  {
    name: 'youth-center',
    // 온통청년 issues its own key; a data.go.kr key is not interchangeable.
    envKeys: ['YOUTH_CENTER_API_KEY'],
    createAdapter: (apiKey) =>
      new YouthCenterRepository({ apiKey, pageSize: boundedPageSize, logger: silentLogger }),
  },
  {
    name: 'bokjiro',
    envKeys: ['BOKJIRO_API_KEY', 'DATA_GO_KR_API_KEY'],
    createAdapter: (apiKey) =>
      new BokjiroRepository({ apiKey, pageSize: boundedPageSize, logger: silentLogger }),
  },
  {
    name: 'subsidy24',
    envKeys: ['SUBSIDY24_API_KEY', 'DATA_GO_KR_API_KEY'],
    createAdapter: (apiKey) =>
      new SubsidyRepository({ apiKey, pageSize: boundedPageSize, logger: silentLogger }),
  },
];

async function checkSource(config: SourceConfig): Promise<CanaryResult> {
  const key = config.envKeys.map((name) => process.env[name]?.trim()).find(Boolean);
  if (!key) {
    return { source: config.name, status: 'skipped' };
  }

  try {
    const result = await config.createAdapter(key).search();
    if (result.observation.sourceId !== config.name) {
      return { source: config.name, status: 'drift', detail: 'source_mismatch' };
    }
    return classifyObservation(result.observation);
  } catch {
    // Never copy raw exception text into logs or issues: transports and keys may be sensitive.
    return { source: config.name, status: 'error', detail: 'unexpected_adapter_failure' };
  }
}

function isIssueOpen(title: string): boolean {
  try {
    const output = execFileSync(
      'gh',
      ['issue', 'list', '--search', title, '--state', 'open', '--json', 'title'],
      { encoding: 'utf8' },
    );
    const issues = JSON.parse(output) as Array<{ title: string }>;
    return issues.some((issue) => issue.title === title);
  } catch {
    return false;
  }
}

function fileIssue(source: string, detail: string, runUrl: string): void {
  const title = buildIssueTitle(source);
  if (isIssueOpen(title)) {
    console.log(`[canary] open issue already exists for ${source} — skipping duplicate.`);
    return;
  }

  const body = [
    `## Canary failure: \`${source}\` adapter`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Source | \`${source}\` |`,
    `| Detail | \`${detail}\` |`,
    `| Run | ${runUrl} |`,
    `| Time | ${new Date().toISOString()} |`,
    '',
    'The daily canary executed the production adapter against the live API. The adapter either rejected the current source contract or could not reach the source.',
    '',
    'Close this issue once the adapter is updated (or the source recovers) and the canary is green again.',
  ].join('\n');

  const tmpFile = join(tmpdir(), `canary-body-${source}.md`);
  try {
    writeFileSync(tmpFile, body, 'utf8');
    execFileSync(
      'gh',
      ['issue', 'create', '--title', title, '--body-file', tmpFile, '--label', 'blocked'],
      { stdio: 'inherit' },
    );
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

async function main() {
  const results = await Promise.all(SOURCES.map(checkSource));

  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : '(local run)';

  for (const result of results) {
    const icon =
      result.status === 'ok'
        ? '✅'
        : result.status === 'partial'
          ? '⚠️'
          : result.status === 'skipped'
            ? '⏭️'
            : '❌';
    console.log(
      `${icon} ${result.source}: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`,
    );
    if (result.status === 'drift' || result.status === 'error') {
      fileIssue(result.source, result.detail ?? result.status, runUrl);
    }
  }

  if (results.every((result) => result.status === 'skipped')) {
    console.log(
      '[canary] All sources skipped — no API keys configured (public fork or pre-activation). Exiting neutral.',
    );
    process.exit(0);
  }

  if (hasLiveFailure(results)) {
    console.log('[canary] One or more production adapter checks failed. See issues above.');
    process.exit(1);
  }

  console.log('[canary] All configured production adapters accepted the live source contract.');
}

main().catch(() => {
  console.error('[canary] Unexpected runner failure.');
  process.exit(1);
});
