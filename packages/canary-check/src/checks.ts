import type { SourceObservation } from '@mcp-gen-ui/schema';

export interface CanaryResult {
  source: string;
  status: 'ok' | 'skipped' | 'partial' | 'drift' | 'error';
  detail?: string;
}

/**
 * Convert the same source observation emitted to MCP clients into a canary result.
 * A deliberately bounded first page is healthy-but-partial; rejected records are
 * treated as drift because they indicate that the public mapping no longer holds.
 */
export function classifyObservation(observation: SourceObservation): CanaryResult {
  const base = { source: observation.sourceId };

  if (observation.status === 'ok') {
    return { ...base, status: 'ok' };
  }

  if (
    observation.status === 'partial' &&
    observation.recordCount > 0 &&
    observation.errorCode === 'page_truncated'
  ) {
    return { ...base, status: 'partial', detail: observation.errorCode };
  }

  if (observation.status === 'invalid_payload' || observation.status === 'partial') {
    return {
      ...base,
      status: 'drift',
      detail: observation.errorCode ?? observation.status,
    };
  }

  return {
    ...base,
    status: 'error',
    detail: observation.errorCode ?? observation.status,
  };
}

export function buildIssueTitle(source: string): string {
  return `canary: ${source} adapter drift detected (AFK)`;
}

export function hasLiveFailure(results: CanaryResult[]): boolean {
  return results.some((result) => result.status === 'drift' || result.status === 'error');
}
