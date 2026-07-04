export interface CanaryResult {
  source: string;
  status: 'ok' | 'skipped' | 'drift' | 'error';
  detail?: string;
}

export interface ShieldsEndpointBadge {
  schemaVersion: 1;
  label: string;
  message: CanaryResult['status'];
  color: 'brightgreen' | 'lightgrey' | 'orange' | 'red';
}

export function toShieldsEndpointBadge(result: CanaryResult): ShieldsEndpointBadge {
  const colorByStatus: Record<CanaryResult['status'], ShieldsEndpointBadge['color']> = {
    ok: 'brightgreen',
    skipped: 'lightgrey',
    drift: 'orange',
    error: 'red',
  };

  return {
    schemaVersion: 1,
    label: result.source,
    message: result.status,
    color: colorByStatus[result.status],
  };
}

export function validateYouthCenterShape(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  const result = d.result as Record<string, unknown> | undefined;
  return Array.isArray(result?.youthPolicyList);
}

// NationalWelfarelistV001 is XML-only; validate the raw response text.
export function validateBokjiroShape(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  return data.includes('<wantedList>') && /<resultCode>0<\/resultCode>/.test(data);
}

export function validateSubsidyShape(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  const response = d.response as Record<string, unknown> | undefined;
  const body = response?.body;
  return typeof body === 'object' && body !== null;
}

export function buildIssueTitle(source: string): string {
  return `canary: ${source} adapter drift detected (AFK)`;
}

export function hasLiveFailure(results: CanaryResult[]): boolean {
  return results.some((r) => r.status === 'drift' || r.status === 'error');
}
