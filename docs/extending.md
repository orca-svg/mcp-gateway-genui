# Extending the gateway

The gateway is designed so product teams can keep the MCP transport and stable
JSON contracts while swapping the data source, validation rules, or ranking
policy. Extensions must preserve the public-benefit safety boundary: do not store
sensitive identifiers, do not automate login/identity verification/submission,
and frame recommendations as candidates rather than definitive eligibility
judgements.

## Bring your own data source

`BenefitToolService` depends on the small asynchronous `BenefitRepository`
interface from `@mcp-gen-ui/core`:

```ts
interface BenefitRepository {
  search(): Promise<BenefitRecord[]>;
  getById(id: string): Promise<BenefitRecord | undefined>;
}
```

Implement those two methods for your source of truth, then pass the repository to
`BenefitToolService`:

```ts
import { BenefitToolService, SnapshotStore } from "@mcp-gen-ui/core";
import { JsonFileBenefitRepository } from "../examples/custom-benefit-repository.js";

const repository = new JsonFileBenefitRepository("./my-benefits.json");
const snapshots = new SnapshotStore("./benefit-snapshots.db");
const service = new BenefitToolService(repository, snapshots);

const search = await service.searchBenefits({
  query: "부산 돌봄 교육",
  profile: {
    region: "부산",
    employmentStatus: "unemployed",
    interests: ["employment"]
  }
});
```

The repository can read from a JSON file, remote API, database, cache, or an
in-memory map. The only hard requirement is that returned values validate as
`BenefitRecord`. Use `BenefitRecordSchema.parse(record)` at the repository
boundary so malformed upstream data fails before it reaches the MCP tools.

### Normalize application deadlines

`applicationDeadline` is a UTC-only ISO timestamp (`Z`) in the shared Zod and
JSON Schema contracts. Adapter authors must normalize source-specific deadline
formats before returning `BenefitRecord` values; do not pass local-time strings,
offset timestamps, or bare dates through the repository boundary.

Korean public-data sources often publish bare dates in KST. Treat a bare date as
open through the end of that Korean calendar day and use the shared core helper
to normalize it consistently:

```ts
import { kstDeadlineToUtc } from "@mcp-gen-ui/core";

const applicationDeadline = kstDeadlineToUtc("2026-07-15");
// => "2026-07-15T14:59:59.000Z" (2026-07-15 23:59:59 KST)
```

Malformed source dates should be rejected or handled at the adapter boundary so
`getUpcomingDeadlines` can compare UTC timestamps with `Date.parse` without a
KST deadline expiring nine hours early or late. Deadlines remain informational
only and must not be presented as eligibility determinations.

See [`examples/custom-benefit-repository.ts`](../examples/custom-benefit-repository.ts)
for an asynchronous JSON-file implementation.

## Tool behavior supplied by `BenefitToolService`

Once a custom repository is wired in, the gateway tools operate on those records:

- `searchBenefits` calls `repository.search()`, runs `recommendBenefits`, and
  records snapshots when a `SnapshotStore` is provided.
- `getBenefitDetail` calls `repository.getById(id)` and returns the validated
  benefit detail.
- `buildChecklist` derives required documents from the selected benefit and adds
  a non-eligibility caveat.
- `getApplicationGuide` derives user-action-only steps from the selected benefit.
- `getChangeLog` reads snapshot history from the optional `SnapshotStore`.

This keeps the core transport-neutral: MCP, HTTP, tests, or another host can all
call the same service methods.

## Override consistency rules

Consistency checks are plugin-style functions. You can pass your own
`ConsistencyRule[]` to `runConsistencyRules` or append to the defaults:

```ts
import {
  defaultConsistencyRules,
  runConsistencyRules,
  type ConsistencyRule
} from "@mcp-gen-ui/core";

const requireOwner: ConsistencyRule = {
  id: "required-owner-evidence",
  check: (benefit) =>
    benefit.evidence.some((item) => item.field === "owner")
      ? []
      : [
          {
            ruleId: "required-owner-evidence",
            severity: "warning",
            benefitId: benefit.id,
            message: "owner evidence should be present for imported records."
          }
        ]
};

const issues = runConsistencyRules(benefits, [
  ...defaultConsistencyRules,
  requireOwner
]);
```

Rules should report data-quality issues; they should not collect resident
registration numbers, certificates, passwords, tokens, or other sensitive
identifiers.

## Use `recommendBenefits` directly

If you need a custom transport or pre/post-processing layer, call the LLM-free
recommender directly:

```ts
import { recommendBenefits } from "@mcp-gen-ui/core";

const summaries = recommendBenefits(benefits, {
  query: "취업 지원",
  profile: { region: "부산", employmentStatus: "unemployed" }
});
```

The recommender returns `candidate`, `needs_more_info`, or `not_applicable` with
reasons and missing information. Present these results as candidate-framed
guidance, not as final legal eligibility decisions.

## Extension checklist

Before opening a PR or enabling a custom backend:

1. Validate every external record with `BenefitRecordSchema`.
2. Run `pnpm build && pnpm typecheck && pnpm test`.
3. Keep tests fixture-first or custom-repository-backed so they run without live
   government dependencies.
4. Preserve safety boundaries: no sensitive-identifier storage, no login or
   submission automation, and no definitive eligibility claims.
