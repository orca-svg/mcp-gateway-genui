# Extending the gateway

Extensions must preserve the public-benefit boundary: no sensitive identifiers,
no login/identity/submission automation, and no definitive eligibility claims.

## Bring your own read repository

`BenefitToolService` depends on a source-aware, read-only interface:

```ts
interface BenefitRepository {
  readonly mode: "fixture" | "live" | "mixed";
  search(): Promise<BenefitRepositoryResult>; // { records, dataStatus }
  getById(id: string): Promise<BenefitRepositoryDetailResult>; // { record?, dataStatus }
}
```

Validate both records and envelopes at the boundary:

```ts
import {
  BenefitRepositoryDetailResultSchema,
  BenefitRepositoryResultSchema,
} from "@mcp-gen-ui/schema";
```

Every `BenefitRecord` needs a stable opaque ID, source ID/record ID/revision,
canonical content hash, field-level provenance, at least one structured source
link, freshness inputs, and separately typed constraint rules. See
[`examples/custom-benefit-repository.ts`](../examples/custom-benefit-repository.ts).

```ts
import { BenefitToolService } from "@mcp-gen-ui/core";
import { JsonFileBenefitRepository } from "../examples/custom-benefit-repository.js";

const service = new BenefitToolService(
  new JsonFileBenefitRepository("./my-benefits-v2.json"),
);
const response = await service.searchBenefits({
  query: "부산 돌봄 교육",
  profile: {
    regionCode: "KR-26",
    employmentStatus: "unemployed",
    interests: ["family", "education"],
  },
});
```

Repository reads must remain pure. They do not create snapshots or change-log
rows.

## Explicit ingestion and history

Use the sole write path when a scheduled sync should persist source state:

```ts
import { BenefitIngestionService, SnapshotStore } from "@mcp-gen-ui/core";

const store = new SnapshotStore("benefits.db");
const ingestion = new BenefitIngestionService(store);
const result = ingestion.syncSource({
  observation,
  sourceRevision,
  complete,
  records,
});
```

The batch is validated atomically and scoped by `sourceId`. Identical content
creates no event; updates report exact RFC 6901 JSON Pointer paths. Deletions are
allowed only when both `complete=true` and observation status is `ok`.
Partial/failed syncs never delete data. `getChangeLog` is a paginated read of
this explicit history.

## Assessment and ranking rules

Assessment and ranking are separate APIs. Each structured constraint declares
its dimension, allowed values, operator, evidence basis, stable rule ID/version,
source fields, and explanation.

- Only `authoritative_structured` mismatches may yield `conflict_detected`.
- `derived_text` and `default` evidence never hard-block; missing profile data
  yields `needs_more_info` where appropriate.
- Query, persona, and weights affect `ranking` only, never assessment.
- Scores mean relative relevance. All effective weights equal to zero yields
  score `0` with deterministic opaque-ID ordering.

Call `assessBenefit`, `rankBenefit`, or `recommendBenefits` directly for custom
transports. Do not relabel scores as eligibility, fit, probability, or approval
likelihood.

## Dates, links, and display text

`applicationDeadline` is an ISO timestamp with offset. Korean bare dates are
open through 23:59:59 KST and can be normalized with:

```ts
import { kstDeadlineToUtc } from "@mcp-gen-ui/core";

kstDeadlineToUtc("2026-07-15"); // 2026-07-15T14:59:59.000Z
```

Use structured `links[]`; an official link must use HTTPS and pass the adapter's
exact-origin policy. Preserve untrusted upstream prose as normalized display
text. Instruction-like HTML/Markdown remains inert text; never derive actions or
links from a title/summary.

## Consistency rules

`runConsistencyRules(records, rules)` accepts plugin-style
`ConsistencyRule[]`. Rules report data quality; they must not collect private
identifiers. The defaults require a source link, warn when an online method has
no apply link, and detect duplicate document labels.

## Canary contract for a new adapter

1. Implement `BenefitSourceAdapter.search()` returning an `AdapterResult` with a
   stable `SourceObservation`.
2. Enforce exact HTTPS origin, response type/size, timeout, abort, and bounded
   retry policy through the shared transport.
3. Add recorded official fixtures and boundary tests for upstream error
   envelopes, malformed totals/items, partial pages, rejected records, unsafe
   links, and key redaction.
4. Add a constructor entry to `packages/canary-check/src/run.ts`. The canary
   invokes the production adapter itself; do not add a second envelope parser.
5. Keep missing secrets neutral. Treat `invalid_payload` and record-rejection
   partials as drift; a deliberately bounded `page_truncated` result is a
   healthy warning.

## Extension checklist

1. Validate strict v2 records, repository results, and tool responses.
2. Publish versioned golden fixtures for consumer CI when changing a contract.
3. Run `pnpm schemas`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and
   `pnpm audit --prod`.
4. Preserve coarse-profile, provenance, official-link, fail-closed mode, and
   user-action-only boundaries.
