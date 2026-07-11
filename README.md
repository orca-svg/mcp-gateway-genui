# mcp-gen-ui-gateway

<p align="center">
  <img src="docs/assets/banner.png" alt="mcp-gen-ui-gateway banner" width="720" />
</p>

<p align="center">
  <a href="https://github.com/orca-svg/mcp-gateway-genui/actions/workflows/ci.yml"><img src="https://github.com/orca-svg/mcp-gateway-genui/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/orca-svg/mcp-gateway-genui/actions/workflows/canary.yml"><img src="https://github.com/orca-svg/mcp-gateway-genui/actions/workflows/canary.yml/badge.svg" alt="Canary (live APIs)"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.5.0-339933.svg" alt="Node >= 22.5.0">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

Open-source **MCP gateway for public-benefit discovery and Gen UI rendering**.

It exposes Korean public-benefit data through deterministic MCP tools and
renders the structured JSON responses as compact UI. The server is **LLM-free** —
the MCP host model handles the conversation and decides which tools to call.

> **Status:** G-4 operational-trust release line. This repository is a clean-room reimplementation and
> continued maintenance of the original [KOI competition project](https://github.com/koi2026/mcp-gen-ui-gateway),
> used only as a specification (PRD, schema definitions, host prompts). See `NOTICE`.

## Contents

- [Quick start](#quick-start)
- [Why](#why)
- [Architecture](#architecture)
- [Public API](#public-api)
- [Tools](#tools)
- [Safety boundaries](#safety-boundaries)
- [Documentation](#documentation)
- [License](#license)

## Quick start

Requires **Node.js >= 22.5** (uses the built-in `node:sqlite`) and pnpm.

```bash
pnpm install
pnpm build       # build workspace packages first
pnpm typecheck
pnpm test
```

Run pieces individually:

```bash
pnpm dev          # demo UI (Vite)
pnpm mcp          # stdio MCP server
pnpm schemas      # re-export JSON Schema from Zod
```

### Using the MCP server from a host

The server speaks MCP over stdio. Point an MCP host at the built binary:

```json
{
  "mcpServers": {
    "mcp-gen-ui-gateway": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "MCP_GEN_UI_REPOSITORY_MODE": "fixture",
        "MCP_GEN_UI_DB_PATH": "mcp-gen-ui-gateway.db"
      }
    }
  }
}
```

See `docs/host-prompts.md` for the recommended host prompt and an example flow.

## Why

Public-benefit information is scattered across government pages with qualification
rules that are hard to compare. This gateway normalizes that data behind stable
JSON contracts so any MCP host can:

- search benefits from **non-identifying** profile conditions,
- distinguish **`candidate` / `needs_more_info` / `conflict_detected`** assessment,
- see the **reasons** and the **conditions still to verify**,
- get a **preparation checklist** and a **user-action-only application guide**.

It never stores sensitive identifiers, never claims definitive eligibility, and
never automates login or submission.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Architecture

```
Host (any MCP client)
   └─ MCP tool call ─▶ BenefitToolService              (packages/core)
                         ├─ source-aware read repository (fixture/live/mixed)
                         ├─ assessment (structured constraints only hard-conflict)
                         └─ relative-relevance ranking (rule-based, LLM-free)
                       └─ strict v2 JSON ─▶ Gen UI / A2UI consumer

Source adapter ─▶ BenefitIngestionService ─▶ SnapshotStore (explicit write path)
```

### Monorepo layout

| Package | Responsibility |
| --- | --- |
| `@mcp-gen-ui/schema` | Zod schemas as the single source of truth; exports JSON Schema. |
| `@mcp-gen-ui/core` | Repository, rule-based recommender, SQLite snapshot/change-log, plugin consistency rules, transport-neutral `BenefitToolService`. |
| `@mcp-gen-ui/adapters` | Composite/cache repository wrappers and live Korean public-benefit data adapters. |
| `@mcp-gen-ui/mcp-server` | stdio MCP server registering the gateway tools. |
| `@mcp-gen-ui/demo-ui` | Vite + React renderer; maps fixture domain JSON through an A2UI adapter. |

## Public API

The published npm surface is intentionally small so embedders can depend on the
gateway without taking on the demo app or repository internals:

| Package | Public contract |
| --- | --- |
| `@mcp-gen-ui/schema` | Strict Zod 4 contracts and draft 2020-12 JSON Schema for all seven v2 tools, plus versioned fixtures for representative contract states. |
| `@mcp-gen-ui/core` | Source-aware read repositories, assessment/ranking, explicit ingestion, atomic SQLite snapshots/change history, and `BenefitToolService`. |
| `@mcp-gen-ui/adapters` | Optional `BenefitRepository` implementations for fan-in, TTL caching, and live 온통청년 · 복지로 · 기획예산처 국고보조금 공모사업 data. |
| `@mcp-gen-ui/mcp-server` | The stdio MCP server binary that exposes the gateway tools, including persona preset discovery and upcoming-deadline retrieval. |

`fixtureBenefits` is exported as example data for tests, demos, and local
experiments. It is not a live government data source or a stability promise about
real benefit availability.

### Assessment and ranking contract

`searchBenefits` accepts a non-identifying `profile.persona` and optional
per-dimension `weights`. The built-in personas are `youth_jobseeker`,
`university_student`, `newlywed_family`, `single_parent`, `senior`, and
`general`; request weights override the selected preset only for the dimensions
provided. Every result keeps `assessment` separate from `ranking`: only a
conflicting `authoritative_structured` constraint can produce
`conflict_detected`; derived text and defaults never hard-block. `ranking.score`
is relative relevance, not probability or eligibility, and
`ranking.breakdown` explains its dimensions. Persona, query, and weights affect
ranking only. Stable opaque IDs break ties, including the all-zero-weight case.
`getUpcomingDeadlines` reuses this contract alongside a structured UTC
`applicationDeadline`.

### Embed the core package

```bash
pnpm add @mcp-gen-ui/core
```

```ts
import { BenefitToolService, FixtureBenefitRepository } from "@mcp-gen-ui/core";

const service = new BenefitToolService(new FixtureBenefitRepository());
const results = await service.searchBenefits({
  query: "부산 취업 지원",
  profile: { regionCode: "KR-26", employmentStatus: "unemployed" }
});
```

See [`docs/extending.md`](docs/extending.md) for custom `BenefitRepository`
implementations, `SnapshotStore` usage, and extension safety rules.

### Versioning while pre-1.0

This project follows SemVer, but while packages are `0.x`, minor releases may
include breaking changes to the public API. Patch releases should remain
backward-compatible bug fixes. Breaking 0.x minors will be called out in the
changelog and migration notes where practical.

## Tools

The stdio MCP server currently exposes these seven deterministic tools:

| Tool | Input | Output |
| --- | --- | --- |
| `searchBenefits` | `{ query, profile?, weights? }` | `benefit-search.v2`: source status, assessment, relative ranking, provenance, verified links, and freshness. |
| `listPersonas` | `{}` | Built-in persona presets and scoring weights for host selection. |
| `getBenefitDetail` | `{ id }` | Structured benefit detail, including `applicationDeadline` when known. |
| `getUpcomingDeadlines` | `{ profile?, withinDays?, weights? }` | `upcoming-deadlines.v2`; `withinDays` is an integer from 1 through 365. |
| `buildChecklist` | `{ benefitId }` | Document checklist with a non-eligibility caveat. |
| `getApplicationGuide` | `{ benefitId }` | User-action-only application steps. |
| `getChangeLog` | `{ entityId?, cursor?, limit? }` | Paginated snapshot changes; `limit` is 1–100 (default 50), and each entry identifies its source. |

All inputs and success outputs are strict. Unknown keys—including PII-shaped
keys—are rejected. MCP failures are stable JSON text errors (`mcp-error.v1`);
successes expose identical JSON in `structuredContent` and `TextContent`.

## Repository mode

Runtime data selection is explicit:

| Variable | Meaning |
| --- | --- |
| `MCP_GEN_UI_REPOSITORY_MODE` | `fixture`, `live`, or `mixed`. Required when `NODE_ENV=production`; non-production defaults to `fixture`. |
| `MCP_GEN_UI_LIVE_SOURCES` | Optional comma list from `youth-center,bokjiro,subsidy24`. Omission discovers sources with configured keys. |
| `YOUTH_CENTER_API_KEY` | Separate 온통청년 key; no shared-key fallback. |
| `BOKJIRO_API_KEY` / `SUBSIDY24_API_KEY` | Per-source data.go.kr keys. `DATA_GO_KR_API_KEY` is their shared fallback. |
| `MCP_GEN_UI_CACHE_TTL_MS` | Live/mixed read cache, 1 second–24 hours; default 5 minutes. |
| `YOUTH_CENTER_API_ENDPOINT` / `BOKJIRO_API_ENDPOINT` / `SUBSIDY24_API_ENDPOINT` | Optional endpoint overrides. Each must keep its source's exact official HTTPS origin and contain no credentials, query, or fragment. |
| `MCP_GEN_UI_DB_PATH` | SQLite snapshot/change-history path; defaults to `mcp-gen-ui-gateway.db`. Use `:memory:` for ephemeral runs. |

`live` and `mixed` fail closed if no source is selected or a selected source is
missing its key. There is no silent fallback from live data to fixtures. Every
response carries `dataStatus.mode`, `partial`, and per-source observations.
See [`docs/data-sources.md`](docs/data-sources.md) for source contracts and
[`docs/migration-v0.2-to-v0.3.md`](docs/migration-v0.2-to-v0.3.md) for the v2
migration.

## Safety boundaries

- **No sensitive identifiers** are stored (resident numbers, passwords, certificates, tokens).
- Profiles accept only coarse enums such as ISO region code and age band; unknown or PII-shaped fields fail validation.
- Recommendations are **candidates, not eligibility decisions**, and ship with caveats.
- Only separately structured authoritative constraints can report a conflict; extracted prose remains ranking evidence.
- **No login, identity verification, or submission automation.**

## Documentation

- [`docs/data-sources.md`](docs/data-sources.md) — official fixture source attribution, license notes, and source URL coverage.
- [`docs/migration-v0.2-to-v0.3.md`](docs/migration-v0.2-to-v0.3.md) — strict v2 contract and runtime migration.
- [`docs/prd.md`](docs/prd.md) — product spec and scope.
- [`docs/host-prompts.md`](docs/host-prompts.md) — recommended host prompt + tools.
- [`docs/personas.md`](docs/personas.md) — persona weighting model, preset rationale, and score contract.
- [`docs/extending.md`](docs/extending.md) — bring your own data source and other extension points.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branching and PR workflow.
- [`docs/roadmap.md`](docs/roadmap.md) — milestone status and deferred work (including browser-assist).
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE). Originally created by Team KOI; reimplemented and
maintained here — see [`NOTICE`](NOTICE).
