# Migrate from 0.2 to 0.3

Version 0.3 is an intentional pre-1.0 breaking minor. It replaces ambiguous
flat recommendation/source fields with a strict, source-aware v2 contract.

## Consumer changes

- Pin all gateway packages to the same `0.3.x` version.
- Regenerate or import JSON Schema from `@mcp-gen-ui/schema/schema/v2/*`.
- Replace free-form `profile.region` with `regionCode`, and replace the v0.2
  `profile.ageRange` enum field with `ageBand`.
  Profiles are strict; remove unknown and PII-shaped keys instead of expecting
  them to be stripped.
- Normalize raw queries with `normalizeQuery`; submitted queries must already be
  trimmed NFC, 1–300 Unicode code points, with no control/zero-width/bidi
  controls.
- Read `assessment.status` (`candidate`, `needs_more_info`,
  `conflict_detected`) separately from `ranking.score` and
  `ranking.breakdown`. The v0.2 `not_applicable` status is removed; only an
  authoritative structured mismatch produces `conflict_detected`. The v0.2
  flat `score` and `scoreBreakdown` fields move to `ranking.score` and
  `ranking.breakdown`. Do not treat ranking as eligibility or probability.
- Replace flat `sourceUrl`/`applicationUrl` with structured `links[]`; render
  only those links. Consume `provenance`, `freshness`, and `dataStatus`.
- Reject unsupported `schemaVersion` with a visible compatibility fallback.
  Validate the published `fixtures/v2` corpus—including partial/all-source
  failure and hostile-display-text cases—in consumer CI.
- MCP successes return identical JSON in structured and text content. MCP
  failures are text-only `mcp-error.v1` JSON with `isError=true`.

## Repository and persistence changes

Custom `BenefitRepository` implementations now expose `mode` and return
source-aware result envelopes rather than raw records. Update records with
`sourceId`, `sourceRecordId`, `sourceRevision`, `contentHash`, `lastFetchedAt`,
field provenance, and structured links. Replace v0.2 `regionTags`, `ageRanges`,
`studentOnly`, `employmentStatuses`, and `householdTypes` matching fields with
typed `constraints[]` rules carrying basis, rule ID/version, source fields, and
an explanation.

Tool reads no longer write snapshots. Schedule ingestion separately through
`BenefitIngestionService.syncSource`. Existing legacy SQLite tables remain
untouched; v2 state uses source-scoped tables and a cursor-paginated change log.

## Runtime changes

Set `MCP_GEN_UI_REPOSITORY_MODE=fixture|live|mixed` explicitly in production.
Production startup now fails when mode is omitted. Live/mixed modes also fail if
no source is selected or a selected key is absent—there is no fixture fallback.

Use `MCP_GEN_UI_LIVE_SOURCES` for a comma-separated subset of
`youth-center,bokjiro,subsidy24`. 온통청년 requires
`YOUTH_CENTER_API_KEY`; 복지로 and 국고보조금 accept their per-source key or
`DATA_GO_KR_API_KEY` as a shared fallback.

`MCP_GEN_UI_CACHE_TTL_MS` optionally sets the live/mixed read cache from 1,000
through 86,400,000 ms (default 300,000). Endpoint overrides use
`YOUTH_CENTER_API_ENDPOINT`, `BOKJIRO_API_ENDPOINT`, and
`SUBSIDY24_API_ENDPOINT`; each must retain its source's exact official HTTPS
origin and contain no credentials, query, or fragment.

The `subsidy24` source ID and `SUBSIDY24_*` environment prefix are retained for
compatibility, but this adapter now represents the 기획예산처 national-subsidy
open-call dataset—not the 행정안전부 보조금24 individual-benefit catalog.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm schemas
pnpm build
pnpm typecheck
pnpm test
pnpm audit --prod
```

For hosts, call all seven tools over stdio and validate each response against
the corresponding published v2 schema before promotion.
