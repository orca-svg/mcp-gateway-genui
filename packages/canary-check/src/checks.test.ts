import { describe, expect, it } from 'vitest';
import {
  buildIssueTitle,
  hasLiveFailure,
  toShieldsEndpointBadge,
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
  // Live envelope recorded 2026-07-04: NationalWelfarelistV001 is XML-only and
  // requires callTp=L + srchKeyCode; success is <wantedList> with <resultCode>0.
  it('accepts the recorded live XML envelope', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><wantedList><totalCount>460</totalCount><pageNo>1</pageNo><numOfRows>2</numOfRows><resultCode>0</resultCode><resultMessage>SUCCESS</resultMessage><servList><servId>WLF00000060</servId></servList></wantedList>';
    expect(validateBokjiroShape(xml)).toBe(true);
  });

  it('rejects the parameter-error XML envelope', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><wantedList><totalCount>0</totalCount><resultCode>10</resultCode><resultMessage>INVALID_REQUEST_PARAMETER_ERROR</resultMessage></wantedList>';
    expect(validateBokjiroShape(xml)).toBe(false);
  });

  it('rejects non-wantedList XML and HTML error pages', () => {
    expect(validateBokjiroShape('<html><body>error</body></html>')).toBe(false);
    expect(validateBokjiroShape('<OpenAPI_ServiceResponse></OpenAPI_ServiceResponse>')).toBe(false);
  });

  it('rejects null and non-strings', () => {
    expect(validateBokjiroShape(null)).toBe(false);
    expect(validateBokjiroShape({ response: { body: {} } })).toBe(false);
  });
});

describe('validateSubsidyShape', () => {
  // Live envelope recorded 2026-07-04 from MoefOpenAPI/T_OPD_PRMSCT_SBBGST:
  // standard wrapped format with response.header + response.body.
  it('accepts the recorded live MOEF envelope', () => {
    const data = {
      response: {
        header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
        body: {
          pageNo: 1,
          totalCount: 66,
          numOfRows: 2,
          items: { item: [{ REALM_CODE: '010', SECT_NM: '입법및선거관리', BSNSYEAR: '2026' }] },
        },
      },
    };
    expect(validateSubsidyShape(data)).toBe(true);
  });

  it('accepts an empty body object', () => {
    expect(validateSubsidyShape({ response: { body: {} } })).toBe(true);
  });

  it('rejects when response.body is absent', () => {
    expect(validateSubsidyShape({ response: {} })).toBe(false);
    expect(validateSubsidyShape({})).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(validateSubsidyShape(null)).toBe(false);
    expect(validateSubsidyShape('text')).toBe(false);
    expect(validateSubsidyShape(42)).toBe(false);
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

describe('toShieldsEndpointBadge', () => {
  it('renders ok results as shields.io endpoint JSON', () => {
    expect(toShieldsEndpointBadge({ source: 'youth-center', status: 'ok' })).toEqual({
      schemaVersion: 1,
      label: 'youth-center',
      message: 'ok',
      color: 'brightgreen',
    });
  });

  it('uses distinct messages and colors for skipped, drift, and error', () => {
    expect(toShieldsEndpointBadge({ source: 'bokjiro', status: 'skipped' })).toMatchObject({
      message: 'skipped',
      color: 'lightgrey',
    });
    expect(toShieldsEndpointBadge({ source: 'bokjiro', status: 'drift' })).toMatchObject({
      message: 'drift',
      color: 'orange',
    });
    expect(toShieldsEndpointBadge({ source: 'bokjiro', status: 'error' })).toMatchObject({
      message: 'error',
      color: 'red',
    });
  });
});
