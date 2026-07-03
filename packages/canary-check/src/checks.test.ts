import { describe, expect, it } from 'vitest';
import {
  buildIssueTitle,
  hasLiveFailure,
  validateBokjiroShape,
  validateSubsidyShape,
  validateYouthCenterShape,
} from './checks.js';
import type { CanaryResult } from './checks.js';

describe('validateYouthCenterShape', () => {
  it('accepts the recorded fixture envelope', () => {
    const data = {
      resultCode: '00',
      result: { youthPolicyList: [{ plcyNo: 'R1', plcyNm: '정책' }] },
    };
    expect(validateYouthCenterShape(data)).toBe(true);
  });

  it('accepts an empty youthPolicyList (valid but no results)', () => {
    expect(validateYouthCenterShape({ result: { youthPolicyList: [] } })).toBe(true);
  });

  it('rejects when result.youthPolicyList is absent', () => {
    expect(validateYouthCenterShape({ result: {} })).toBe(false);
    expect(validateYouthCenterShape({ resultCode: '00' })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(validateYouthCenterShape(null)).toBe(false);
    expect(validateYouthCenterShape('text')).toBe(false);
    expect(validateYouthCenterShape(42)).toBe(false);
  });
});

describe('validateBokjiroShape', () => {
  it('accepts the recorded fixture envelope', () => {
    const data = {
      response: { body: { items: { item: [{ servId: 'W1' }] }, totalCount: 1 } },
    };
    expect(validateBokjiroShape(data)).toBe(true);
  });

  it('accepts an empty body object', () => {
    expect(validateBokjiroShape({ response: { body: {} } })).toBe(true);
  });

  it('rejects when response.body is absent', () => {
    expect(validateBokjiroShape({ response: {} })).toBe(false);
    expect(validateBokjiroShape({})).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(validateBokjiroShape(null)).toBe(false);
    expect(validateBokjiroShape('text')).toBe(false);
  });
});

describe('validateSubsidyShape', () => {
  it('accepts the recorded fixture envelope', () => {
    const data = {
      response: { body: { items: [{ svcId: 'G1' }], totalCount: 1 } },
    };
    expect(validateSubsidyShape(data)).toBe(true);
  });

  it('accepts an empty body object', () => {
    expect(validateSubsidyShape({ response: { body: {} } })).toBe(true);
  });

  it('rejects when response.body is absent', () => {
    expect(validateSubsidyShape({ response: {} })).toBe(false);
  });
});

describe('buildIssueTitle', () => {
  it('produces a consistent AFK-tagged title for deduplication', () => {
    expect(buildIssueTitle('youth-center')).toBe(
      'canary: youth-center adapter drift detected (AFK)',
    );
    expect(buildIssueTitle('bokjiro')).toBe('canary: bokjiro adapter drift detected (AFK)');
    expect(buildIssueTitle('subsidy24')).toBe('canary: subsidy24 adapter drift detected (AFK)');
  });
});

describe('hasLiveFailure', () => {
  it('returns false when all results are ok or skipped', () => {
    const results: CanaryResult[] = [
      { source: 'a', status: 'ok' },
      { source: 'b', status: 'skipped' },
    ];
    expect(hasLiveFailure(results)).toBe(false);
  });

  it('returns true when any result is drift', () => {
    const results: CanaryResult[] = [
      { source: 'a', status: 'ok' },
      { source: 'b', status: 'drift', detail: 'shape mismatch' },
    ];
    expect(hasLiveFailure(results)).toBe(true);
  });

  it('returns true when any result is error', () => {
    expect(hasLiveFailure([{ source: 'a', status: 'error', detail: 'HTTP 503' }])).toBe(true);
  });

  it('returns false for an empty list', () => {
    expect(hasLiveFailure([])).toBe(false);
  });
});
