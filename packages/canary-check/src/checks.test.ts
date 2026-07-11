import { describe, expect, it } from 'vitest';
import {
  buildIssueTitle,
  classifyObservation,
  hasLiveFailure,
  type CanaryResult,
} from './checks.js';
import type { SourceObservation } from '@mcp-gen-ui/schema';

function observation(
  overrides: Partial<SourceObservation> = {},
): SourceObservation {
  return {
    sourceId: 'youth-center',
    status: 'ok',
    retrievedAt: '2026-07-11T00:00:00.000Z',
    recordCount: 2,
    adapterVersion: '0.3.0',
    ...overrides,
  };
}

describe('classifyObservation', () => {
  it('accepts a fully mapped adapter result', () => {
    expect(classifyObservation(observation())).toEqual({
      source: 'youth-center',
      status: 'ok',
    });
  });

  it('reports an intentionally bounded page without failing the canary', () => {
    expect(
      classifyObservation(
        observation({ status: 'partial', errorCode: 'page_truncated' }),
      ),
    ).toEqual({
      source: 'youth-center',
      status: 'partial',
      detail: 'page_truncated',
    });
  });

  it('treats rejected or invalid source records as contract drift', () => {
    expect(
      classifyObservation(
        observation({ status: 'partial', errorCode: 'invalid_record' }),
      ).status,
    ).toBe('drift');
    expect(
      classifyObservation(
        observation({
          status: 'partial',
          errorCode: 'page_truncated',
          recordCount: 0,
        }),
      ).status,
    ).toBe('drift');
    expect(
      classifyObservation(
        observation({ status: 'invalid_payload', errorCode: 'invalid_payload' }),
      ).status,
    ).toBe('drift');
  });

  it('treats transport and upstream failures as live errors', () => {
    expect(
      classifyObservation(
        observation({ status: 'timeout', errorCode: 'request_timeout' }),
      ),
    ).toEqual({
      source: 'youth-center',
      status: 'error',
      detail: 'request_timeout',
    });
    expect(
      classifyObservation(
        observation({ status: 'unavailable', errorCode: 'upstream_error' }),
      ).status,
    ).toBe('error');
  });
});

describe('buildIssueTitle', () => {
  it('produces a consistent AFK-tagged title for deduplication', () => {
    expect(buildIssueTitle('youth-center')).toBe(
      'canary: youth-center adapter drift detected (AFK)',
    );
  });
});

describe('hasLiveFailure', () => {
  it('does not fail for healthy, bounded, skipped, or empty results', () => {
    const results: CanaryResult[] = [
      { source: 'a', status: 'ok' },
      { source: 'b', status: 'partial', detail: 'page_truncated' },
      { source: 'c', status: 'skipped' },
    ];
    expect(hasLiveFailure(results)).toBe(false);
    expect(hasLiveFailure([])).toBe(false);
  });

  it('fails for mapping drift or live errors', () => {
    expect(hasLiveFailure([{ source: 'a', status: 'drift' }])).toBe(true);
    expect(hasLiveFailure([{ source: 'a', status: 'error' }])).toBe(true);
  });
});
