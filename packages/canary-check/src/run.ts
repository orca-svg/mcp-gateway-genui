import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildIssueTitle,
  hasLiveFailure,
  validateBokjiroShape,
  validateSubsidyShape,
  validateYouthCenterShape,
  type CanaryResult,
} from './checks.js';

interface SourceConfig {
  name: string;
  // First non-empty env var found in envKeys is used; DATA_GO_KR_API_KEY is the shared fallback.
  envKeys: string[];
  endpoint: string;
  queryParams: (key: string) => Record<string, string>;
  validate: (data: unknown) => boolean;
  // XML-only APIs (e.g. bokjiro) validate the raw response text instead of parsed JSON.
  responseFormat?: 'json' | 'xml';
}

const SOURCES: SourceConfig[] = [
  {
    name: 'youth-center',
    // No DATA_GO_KR_API_KEY fallback: 온통청년 requires a separate youthcenter.go.kr
    // key, so the shared data.go.kr key always fails (HTTP 500) on this source.
    envKeys: ['YOUTH_CENTER_API_KEY'],
    endpoint: 'https://apis.data.go.kr/1051000/youthPlcyList/getYouthPlcyList',
    queryParams: (key) => ({ serviceKey: key, pageNo: '1', numOfRows: '5', type: 'json' }),
    validate: validateYouthCenterShape,
  },
  {
    name: 'bokjiro',
    envKeys: ['BOKJIRO_API_KEY', 'DATA_GO_KR_API_KEY'],
    endpoint:
      'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001',
    // callTp=L (list call) and srchKeyCode are required; omitting them returns
    // INVALID_REQUEST_PARAMETER_ERROR. The API responds in XML only.
    queryParams: (key) => ({
      serviceKey: key,
      callTp: 'L',
      pageNo: '1',
      numOfRows: '5',
      srchKeyCode: '003',
    }),
    validate: validateBokjiroShape,
    responseFormat: 'xml',
  },
  {
    name: 'subsidy24',
    envKeys: ['SUBSIDY24_API_KEY', 'DATA_GO_KR_API_KEY'],
    endpoint: 'https://apis.data.go.kr/1051000/MoefOpenAPI/T_OPD_PRMSCT_SBBGST',
    queryParams: (key) => ({
      serviceKey: key,
      pageNo: '1',
      numOfRows: '5',
      resultType: 'json',
      bsnsyear: new Date().getFullYear().toString(),
    }),
    validate: validateSubsidyShape,
  },
];

async function checkSource(config: SourceConfig): Promise<CanaryResult> {
  const key = config.envKeys.map((k) => process.env[k]).find(Boolean);
  if (!key) {
    return { source: config.name, status: 'skipped' };
  }

  const url = new URL(config.endpoint);
  for (const [param, value] of Object.entries(config.queryParams(key))) {
    url.searchParams.set(param, value);
  }

  let data: unknown;
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return { source: config.name, status: 'error', detail: `HTTP ${response.status}` };
    }
    data = config.responseFormat === 'xml' ? await response.text() : await response.json();
  } catch (err) {
    return { source: config.name, status: 'error', detail: String(err) };
  }

  if (!config.validate(data)) {
    return { source: config.name, status: 'drift', detail: 'response envelope shape mismatch' };
  }

  return { source: config.name, status: 'ok' };
}

function isIssueOpen(title: string): boolean {
  try {
    const output = execSync(`gh issue list --search ${JSON.stringify(title)} --state open --json title`, {
      encoding: 'utf8',
    });
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
    `## Canary drift: \`${source}\` adapter`,
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| Source | \`${source}\` |`,
    `| Detail | ${detail} |`,
    `| Run | ${runUrl} |`,
    `| Time | ${new Date().toISOString()} |`,
    '',
    'The daily canary detected that this adapter\'s live API response no longer matches the recorded fixture shape. Investigate whether the upstream API changed its response envelope.',
    '',
    'Close this issue once the adapter is updated and the canary is green again.',
  ].join('\n');

  const tmpFile = join(tmpdir(), `canary-body-${source}.md`);
  try {
    writeFileSync(tmpFile, body, 'utf8');
    execSync(
      `gh issue create --title ${JSON.stringify(title)} --body-file ${JSON.stringify(tmpFile)} --label blocked`,
      { stdio: 'inherit' },
    );
  } finally {
    try { unlinkSync(tmpFile); } catch { /* best-effort */ }
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
      result.status === 'ok' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌';
    console.log(
      `${icon} ${result.source}: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`,
    );
    if (result.status === 'drift' || result.status === 'error') {
      fileIssue(result.source, result.detail ?? result.status, runUrl);
    }
  }

  if (results.every((r) => r.status === 'skipped')) {
    console.log('[canary] All sources skipped — no API keys configured (public fork or pre-activation). Exiting neutral.');
    process.exit(0);
  }

  if (hasLiveFailure(results)) {
    console.log('[canary] One or more sources failed. See issues filed above.');
    process.exit(1);
  }

  console.log('[canary] All configured sources healthy.');
}

main().catch((err) => {
  console.error('[canary] Unexpected error:', err);
  process.exit(1);
});
