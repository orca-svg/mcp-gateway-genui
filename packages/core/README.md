# @mcp-gen-ui/core

Transport-neutral public-benefit business logic for the mcp-gen-ui gateway.

It includes the fixture-backed benefit repository, rule-based recommendation engine, SQLite snapshot/change-log support, consistency checks, and `BenefitToolService` used by MCP transports.

## Install

```bash
npm install @mcp-gen-ui/core
```

## Usage

```ts
import { BenefitToolService, FixtureBenefitRepository } from '@mcp-gen-ui/core';

const service = new BenefitToolService(new FixtureBenefitRepository());
```

## Persona presets

`defaultPersonaRegistry` ships starter recommendation weight presets for
`youth_jobseeker`, `university_student`, `newlywed_family`, `single_parent`,
`senior`, and `general`. `general` is the backward-compatible uniform-weight
default. Use `resolveWeights(persona, overrides)` to merge request-level weight
overrides on top of a preset, or pass `{ personas }` to `BenefitToolService` to
replace the registry for an embedder-specific deployment.

The package is LLM-free.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.
