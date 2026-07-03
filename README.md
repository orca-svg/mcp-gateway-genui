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

> **Status:** G-1 MVP. This repository is a clean-room reimplementation and
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
      "env": { "MCP_GEN_UI_DB_PATH": "mcp-gen-ui-gateway.db" }
    }
  }
}
```

See `docs/host-prompts.md` for the recommended host prompt and an example flow.

## Why

Public-benefit information is scattered across government pages with eligibility
rules that are hard to interpret. This gateway normalizes that data behind stable
JSON contracts so any MCP host can:

- search benefits from **non-identifying** profile conditions,
- understand each result as a **candidate / needs-more-info / not-applicable**,
- see the **reasons** and the **conditions still to verify**,
- get a **preparation checklist** and a **user-action-only application guide**.

It never stores sensitive identifiers, never claims definitive eligibility, and
never automates login or submission.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Architecture

```
Host (Claude / any MCP host)
   └─ MCP tool call ─▶ BenefitToolService            (packages/core)
                         ├─ BenefitRepository (fixtures)
                         ├─ recommendBenefits (rule-based, LLM-free)
                         └─ SnapshotStore (node:sqlite)
                       └─ Zod-validated JSON ─▶ demo-ui (domain JSON → A2UI → render)
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
| `@mcp-gen-ui/schema` | Zod schemas and generated JSON Schema types that define tool input/output contracts, including `profile.persona`, request `weights`, result `score`, `scoreBreakdown`, and structured `applicationDeadline` fields. |
| `@mcp-gen-ui/core` | Stable embedder APIs: `BenefitRepository`, `BenefitToolService`, `SnapshotStore`, persona helpers (`defaultPersonaRegistry`, `resolveWeights`), and the candidate-framed recommendation/checklist/deadline helpers they compose. |
| `@mcp-gen-ui/adapters` | Optional `BenefitRepository` implementations for fan-in, TTL caching, and live 온통청년 · 복지로 · 보조금24 public-benefit data. |
| `@mcp-gen-ui/mcp-server` | The stdio MCP server binary that exposes the gateway tools, including persona preset discovery and upcoming-deadline retrieval. |

`fixtureBenefits` is exported as example data for tests, demos, and local
experiments. It is not a live government data source or a stability promise about
real benefit availability.

### Persona and score contract

`searchBenefits` accepts a non-identifying `profile.persona` and optional
per-dimension `weights`. The built-in personas are `youth_jobseeker`,
`university_student`, `newlywed_family`, `single_parent`, `senior`, and
`general`; request weights override the selected preset only for the dimensions
provided. Result summaries include a normalized `score` plus `scoreBreakdown`
items (`dimension`, `signal`, `weight`, `contribution`, `explanation`) so hosts
can render transparent ranking explanations without claiming legal eligibility.
`getUpcomingDeadlines` returns the same score fields alongside each structured
UTC `applicationDeadline`.

### Embed the core package

```bash
pnpm add @mcp-gen-ui/core
```

```ts
import { BenefitToolService, FixtureBenefitRepository } from "@mcp-gen-ui/core";

const service = new BenefitToolService(new FixtureBenefitRepository());
const results = await service.searchBenefits({
  query: "부산 취업 지원",
  profile: { region: "부산", employmentStatus: "unemployed" }
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
| `searchBenefits` | `{ query, profile, weights? }` | Ranked benefit candidates with evidence, candidate-framed status, `score`, and `scoreBreakdown`. |
| `listPersonas` | `{}` | Built-in persona presets and scoring weights for host selection. |
| `getBenefitDetail` | `{ id }` | Structured benefit detail, including `applicationDeadline` when known. |
| `getUpcomingDeadlines` | `{ profile?, withinDays? }` | Deadline-bearing benefit candidates sorted by soonest application deadline, with score fields reused from recommendations. |
| `buildChecklist` | `{ benefitId }` | Document checklist with a non-eligibility caveat. |
| `getApplicationGuide` | `{ benefitId }` | User-action-only application steps. |
| `getChangeLog` | `{ entityId? }` | Snapshot / change-log entries. |

## Safety boundaries

- **No sensitive identifiers** are stored (resident numbers, passwords, certificates, tokens).
- Recommendations are **candidates, not eligibility decisions**, and ship with caveats.
- **No login, identity verification, or submission automation.**

## Documentation

- [`docs/data-sources.md`](docs/data-sources.md) — official fixture source attribution, license notes, and source URL coverage.
- [`docs/prd.md`](docs/prd.md) — product spec and scope.
- [`docs/host-prompts.md`](docs/host-prompts.md) — recommended host prompt + tools.
- [`docs/personas.md`](docs/personas.md) — persona weighting model, preset rationale, and score contract.
- [`docs/extending.md`](docs/extending.md) — bring your own data source and other extension points.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branching and PR workflow.
- [`docs/roadmap.md`](docs/roadmap.md) — G-1 scope and deferred work (incl. browser-assist).
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE). Originally created by Team KOI; reimplemented and
maintained here — see [`NOTICE`](NOTICE).
