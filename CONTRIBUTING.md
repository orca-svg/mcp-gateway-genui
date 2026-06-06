# Contributing

Thanks for your interest in improving **mcp-gen-ui-gateway**.

## Prerequisites

- Node.js >= 22.5 (the gateway uses the built-in `node:sqlite`).
- pnpm (the repo pins a version via the `packageManager` field; `corepack enable` will pick it up).

## Setup

```bash
pnpm install
pnpm build       # workspace packages must build before typecheck/test resolve cross-package imports
pnpm typecheck
pnpm test
```

Useful scripts:

- `pnpm dev` — run the demo UI.
- `pnpm mcp` — run the stdio MCP server.
- `pnpm schemas` — re-export JSON Schema from the Zod source of truth.

## Project layout

```
packages/schema      Zod schemas (single source of truth) + JSON Schema export
packages/core        repository, recommender, sqlite-store, consistency, tool-service
packages/mcp-server  stdio MCP server exposing the five tools
apps/demo-ui         Vite + React renderer (domain JSON → A2UI adapter)
docs/                PRD, host prompts, git workflow, roadmap
```

## Working agreements

- **Schema is the contract.** Change `packages/schema` first, then run `pnpm schemas` and commit the regenerated JSON Schema.
- **Tests assert behavior, not internals.** Keep the suite fixture-first so it runs with no live dependencies.
- **No LLM in the server.** Orchestration belongs to the host.
- **Respect the safety boundary** (see below) in every change.

## Safety boundary (public-benefit domain)

Do not introduce:

- Storage of sensitive identifiers (resident registration numbers, passwords, certificates, authentication tokens).
- Anything that presents recommendations as definitive legal eligibility.
- Login, identity verification, or form-submission automation.

## Pull requests

See `docs/git-workflow.md`. Branch from `main`, keep changes scoped, ensure
`build` / `typecheck` / `test` pass, and fill in the PR template's safety checklist.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Attribution

This repository reimplements and maintains a project originally created by Team
KOI (https://github.com/koi2026/mcp-gen-ui-gateway). See `NOTICE`.
