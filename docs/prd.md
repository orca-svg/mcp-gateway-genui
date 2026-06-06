# PRD: MCP-Gen UI Gateway MVP

> Specification reference. This document is adapted from the original KOI
> competition project (https://github.com/koi2026/mcp-gen-ui-gateway) and used
> as the contract for this clean-room reimplementation. See **Status in this
> repository** for what G-1 actually ships.

## Problem Statement

Users who need public-service or public-benefit information currently have to search across fragmented government pages, interpret eligibility rules manually, and keep track of required documents, application paths, and changed guidance themselves.

The project needs an open-source MCP server that can gather and normalize public-service data, expose it through deterministic tools, and power a Gen UI client that turns structured JSON into compact, usable UI.

## Solution

Build an open-source **MCP-Gen UI Gateway** focused first on Korean public benefits and Government24-style public-service discovery.

The MVP provides a local MCP server, shared JSON schemas, SQLite-backed snapshot/change logging, rule-based consistency checks, and a Vite React demo UI that renders benefit search results, details, checklists, and application guides from structured JSON.

## User Stories

1. As a citizen, I want to describe my situation in natural language, so that I can find relevant public benefits without knowing exact program names.
2. As a citizen, I want benefit results grouped by candidate, needs-more-info, and not-applicable, so that I understand the confidence level of each result.
3. As a citizen, I want to see why a benefit was recommended, so that I can judge whether it applies to me.
4. As a citizen, I want to see missing information for a benefit, so that I know which conditions I still need to verify.
5. As a citizen, I want a checklist of required documents and conditions, so that I can prepare before applying.
6. As a citizen, I want a step-by-step application guide, so that I know where to go next without the system submitting anything for me.
7. As a citizen, I want links back to official sources, so that I can confirm the latest details before acting.
8. As a user, I want the system to avoid storing sensitive identifiers, so that I can use the tool safely in a local open-source setup.
9. As a user, I want recommendations expressed as candidates rather than definitive eligibility decisions, so that I do not mistake guidance for legal confirmation.
10. As a developer, I want MCP tools with stable JSON contracts, so that I can build other clients on top of the server.
11. As a developer, I want schemas exported as JSON Schema, so that non-TypeScript clients can validate responses.
12. As a UI developer, I want domain JSON separated from A2UI mapping, so that the same MCP server can support multiple UI renderers.
13. As a UI developer, I want a fixture-backed demo UI, so that I can verify rendering without live government-site dependencies.
14. As a maintainer, I want snapshots and change logs, so that government data changes can be tracked and explained.
15. As a maintainer, I want fixture import/export, so that tests and demos are reproducible.
16. As a contributor, I want consistency rules to be plugin-like, so that new validation rules can be added without rewriting core logic.
17. As an integrator, I want stdio MCP support first, so that the server works with local MCP hosts.
18. As a future platform maintainer, I want the core transport-neutral, so that HTTP/SSE can be added later.
19. _(deferred — see Roadmap)_ As a security-conscious user, I want browser assist clearly marked experimental, so that I understand its limitations.
20. _(deferred — see Roadmap)_ As a security-conscious user, I want browser assist to require explicit approval before clicks, so that it cannot act on pages without consent.

## Implementation Decisions

- Use **TypeScript/Node.js** across the MCP server, shared schemas, domain core, and demo UI.
- Use a **pnpm monorepo** with separate packages for schema, core domain logic, MCP server, and demo UI.
- Use **stdio** as the MVP MCP transport.
- Keep MCP tool logic transport-neutral so HTTP/SSE can be added later.
- Use **Zod as the source of truth** for domain schemas and export JSON Schema for external consumers.
- Store snapshots, change-log entries, and content hashes in **SQLite** (via Node's built-in `node:sqlite`, no native build step).
- Support JSON fixture data for deterministic tests and demos.
- Implement five MVP MCP tools:
  - `searchBenefits`
  - `getBenefitDetail`
  - `buildChecklist`
  - `getApplicationGuide`
  - `getChangeLog`
- Use official/public APIs first and read-only page extraction only as a fallback (future repository backends).
- Do not put an LLM inside the MCP server.
- Let the MCP host/client LLM orchestrate natural-language conversation and tool calls.
- Provide recommended host prompts and tool usage examples in docs.
- Implement Gen UI through a demo **Vite + React SPA**.
- Keep the UI mapping as `domain JSON -> A2UI adapter -> rendered UI`.

## Testing Decisions

- Tests should assert external behavior and contracts, not internal implementation details.
- Test schema parsing and JSON Schema export compatibility.
- Test each MCP tool against fixture data.
- Test SQLite snapshot, change-log, and unchanged/updated/created behavior.
- Test consistency rules with valid, invalid, and partially missing benefit records.
- Test UI rendering from fixture domain JSON.
- Use fixture-first tests so contributors can run the suite without live government-site dependencies.

## Out of Scope

- Government24 login automation.
- Identity verification automation.
- Automatic form submission.
- Storing resident registration numbers, passwords, certificates, authentication tokens, or exact sensitive identifiers.
- Definitive legal eligibility decisions.
- Scheduled crawling or background synchronization.
- Hosted HTTP/SSE gateway mode.
- Experimental browser-assist (deferred — see `docs/roadmap.md`).
- Travel and medical use cases beyond architecture compatibility.

## Status in this repository (G-1)

- **Shipped:** schema, core (repository, recommender, sqlite-store, consistency, tool-service), mcp-server (5 tools), demo-ui, fixture-first tests, CI.
- **Deferred:** experimental `browser-assist` (user stories 19–20) — intentionally excluded from G-1 and tracked in `docs/roadmap.md`.

## Further Notes

- The MVP describes recommendations as “candidate benefits” rather than confirmed eligibility.
- User profile input remains non-identifying: region, age range, student/worker status, household type, and interest category.
- The project optimizes for open-source adoption, clear schemas, reproducible demos, and modular contribution paths.
