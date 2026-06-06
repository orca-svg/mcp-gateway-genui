# mcp-gen-ui-gateway

Open-source **MCP gateway for public-benefit discovery and Gen UI rendering**.

It exposes Korean public-benefit data through five deterministic MCP tools and
renders the structured JSON responses as compact UI. The server is **LLM-free** —
the MCP host model handles the conversation and decides which tools to call.

> **Status:** G-1 MVP. This repository is a clean-room reimplementation and
> continued maintenance of the original [KOI competition project](https://github.com/koi2026/mcp-gen-ui-gateway),
> used only as a specification (PRD, schema definitions, host prompts). See `NOTICE`.

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
| `@mcp-gen-ui/mcp-server` | stdio MCP server registering the five tools. |
| `@mcp-gen-ui/demo-ui` | Vite + React renderer; maps fixture domain JSON through an A2UI adapter. |

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `searchBenefits` | `{ query, profile }` | Ranked benefit candidates with evidence. |
| `getBenefitDetail` | `{ id }` | Structured benefit detail. |
| `buildChecklist` | `{ benefitId }` | Document checklist with a non-eligibility caveat. |
| `getApplicationGuide` | `{ benefitId }` | User-action-only application steps. |
| `getChangeLog` | `{ entityId? }` | Snapshot / change-log entries. |

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

## Safety boundaries

- **No sensitive identifiers** are stored (resident numbers, passwords, certificates, tokens).
- Recommendations are **candidates, not eligibility decisions**, and ship with caveats.
- **No login, identity verification, or submission automation.**

## Documentation

- [`docs/prd.md`](docs/prd.md) — product spec and scope.
- [`docs/host-prompts.md`](docs/host-prompts.md) — recommended host prompt + tools.
- [`docs/git-workflow.md`](docs/git-workflow.md) — branching and PR workflow.
- [`docs/roadmap.md`](docs/roadmap.md) — G-1 scope and deferred work (incl. browser-assist).
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE). Originally created by Team KOI; reimplemented and
maintained here — see [`NOTICE`](NOTICE).
