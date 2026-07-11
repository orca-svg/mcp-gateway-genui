# @mcp-gen-ui/schema

Strict Zod 4 and JSON Schema draft 2020-12 contracts for the source-aware
public-benefit candidate gateway.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Install

```bash
npm install @mcp-gen-ui/schema
```

## v2 contract

```ts
import {
  BenefitSearchRequestSchema,
  BenefitSearchResponseV2Schema,
  normalizeQuery,
} from '@mcp-gen-ui/schema';

const request = BenefitSearchRequestSchema.parse({
  query: normalizeQuery('서울 청년 주거 지원'),
  profile: { regionCode: 'KR-11', ageBand: 'twenties' },
});
```

Every public object is strict. Unknown fields—including PII-shaped fields such
as names, detailed addresses, resident numbers, email addresses, and phone
numbers—are validation errors rather than silently stripped values.

Queries must already be NFC-normalized and trimmed, contain 1–300 Unicode code
points, and contain no control, zero-width, or bidi-control characters. Use
`normalizeQuery` for raw UI input. Adapter display strings should use
`normalizeDisplayText`; that helper retains instruction-like phrases, HTML, and
Markdown as literal text because phrase deletion is not a security boundary.

Ranking weights are finite numbers in the inclusive range 0–10. Partial
request weights override a persona preset. If all effective weights are zero,
all ranking scores are `0` and candidates use deterministic opaque-ID ordering;
assessment is unchanged.

## JSON Schema and fixtures

Run `pnpm schemas` at the repository root to regenerate
`packages/schema/schema/v2`. The published package exposes that directory as
`@mcp-gen-ui/schema/schema/v2/*`. Every artifact has a stable `$id` and uses
JSON Schema draft 2020-12.

Versioned producer fixtures live at `packages/schema/fixtures/v2` in the
repository and are published as `@mcp-gen-ui/schema/fixtures/v2/*`. They include
success, partial-source, all-source-failure, provenance, stale-deadline,
persona, and hostile-display-text cases. Consumers should pin the intended
package version and validate these same fixtures in CI. Unsupported
`schemaVersion` values must produce a visible compatibility fallback.
