# @mcp-gen-ui/core

Transport-neutral public-benefit business logic for the mcp-gen-ui gateway.

It includes source-aware repositories, separate assessment and relevance
ranking, explicit ingestion, atomic source-scoped SQLite snapshots/change
history, consistency checks, and the seven-read-tool `BenefitToolService`.

## Install

```bash
npm install @mcp-gen-ui/core
```

## Usage

```ts
import { BenefitToolService, FixtureBenefitRepository } from '@mcp-gen-ui/core';

const service = new BenefitToolService(new FixtureBenefitRepository());
```

Repository reads return `{ records, dataStatus }` (or `{ record, dataStatus }`)
and never write snapshots. Persist a validated `SourceSyncBatch` through
`BenefitIngestionService.syncSource`; only a complete `ok` sync may delete
records absent from that source. Partial and failed syncs never delete data.

## Persona presets

`defaultPersonaRegistry` ships starter recommendation weight presets for
`youth_jobseeker`, `university_student`, `newlywed_family`, `single_parent`,
`senior`, and `general`. `general` is the backward-compatible uniform-weight
default. Use `resolveWeights(persona, overrides)` to merge request-level weight
overrides on top of a preset, or pass `{ personas }` to `BenefitToolService` to
replace the registry for an embedder-specific deployment.

Assessment is independent from query, persona, and weights. Only a mismatch in
an `authoritative_structured` constraint can produce `conflict_detected`;
derived text produces match/unknown ranking evidence but never a hard block.
The package is LLM-free.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.
