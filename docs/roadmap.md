# Roadmap

## G-1 (completed MVP)

- [x] Zod schema package as single source of truth + JSON Schema export
- [x] Rule-based, LLM-free assessment/ranking with candidate / needs_more_info / conflict_detected
- [x] SQLite snapshot + change log (`node:sqlite`)
- [x] Plugin-style consistency rules
- [x] Transport-neutral `BenefitToolService`
- [x] stdio MCP server exposing seven tools
- [x] Fixture-backed Vite + React demo UI (domain JSON → A2UI adapter)
- [x] Fixture-first test suite + CI (build → typecheck → test)

## G-2 (OSS library readiness)

- [x] Publishable package metadata for `@mcp-gen-ui/schema`,
  `@mcp-gen-ui/core`, and `@mcp-gen-ui/mcp-server`.
- [x] Document the public API surface for embedders, including stable core
  extension points and example-only fixture data.
- [x] Provide `docs/extending.md` and a custom `BenefitRepository` example for
  bring-your-own-data-source integrations.
- [x] Document the pre-1.0 semver policy: 0.x minor releases may break public
  APIs, while patch releases should remain backward-compatible.

## G-3 (capability wave)

Tracked by the issue pipeline; status as of 2026-07-02 — **complete**:

- [x] Persona-weighted scoring with hard-blocker safety gate (#10 / #18)
- [x] Structured `applicationDeadline` + `getUpcomingDeadlines` tool (#11 / #19)
- [x] Built-in persona presets + `listPersonas` tool (#13 / #30)
- [x] Adapter framework + Composite/Caching + 온통청년 live adapter (#12 / #29)
- [x] `applicationDeadline` timezone policy + shared KST→UTC helper (#20 / #31)
- [x] Demo UI renders scores/personas/deadlines + `docs/personas.md` (#16 / #37)
- [x] Changesets + CHANGELOG entries for the G-3 features (#22 / #33)

## G-4 (public 0.x — operational trust)

Goal: a third party can adopt the gateway in production with confidence.
Publishing does **not** wait for full adapter coverage — the first public
release ships as soon as the pipeline is ready and each completed adapter cuts
a 0.x minor. The G-3 changesets accumulated before the first publish, so the
first public version is 0.2.0 (five minor bumps on the 0.1.0 baseline).

- [x] First public npm release 0.2.0 with provenance (#5, after #22)
- [x] Remaining official adapters: 복지로 + 기획예산처 국고보조금 공모사업 (#14 / #38)
- [ ] `McpClientBenefitRepository` + Korean MCP catalog docs (#15)
- [x] Daily live-API canary CI with deduplicated drift issues (#23 / #49)
- [ ] Per-source canary status badges in README (#51)
- [x] Public-data attribution (공공누리), non-eligibility disclaimer alignment,
  and a SECURITY.md response policy (#24 / #34)
- [ ] MCP host compatibility matrix: Claude Desktop, Claude Code, one
  non-Claude host, with config snippets in README (#25)

### G-4.1 strict v2 contract (0.3.0)

- [x] Strict Zod 4 + draft 2020-12 schemas and versioned golden fixtures.
- [x] Separate authoritative assessment from relative relevance ranking.
- [x] Source observations, field provenance, verified links, freshness, and
  fail-closed fixture/live/mixed runtime selection.
- [x] Explicit atomic ingestion with source-scoped snapshots and exact change
  paths; read tools remain side-effect free.
- [x] Production adapter implementations and deterministic fixtures follow the
  documented source contracts; the daily canary executes those same adapter
  classes when source keys are configured.
- [ ] Activate and verify the migrated YouthCenter live contract with an issued
  production key (#54).

## G-5 (1.0 — contract freeze + external validation)

Gate: all declared live sources officially supported, canary green for 14
consecutive days, compatibility matrix complete, compliance docs merged.

- [ ] 1.0 contract freeze across `schema` / `core` / `mcp-server` / `adapters`
  (MCP tool surface, public exports, JSON Schema artifacts) with a contract
  snapshot test; demo-ui stays unpublished (#26)
- [ ] Official MCP registry listing + external-adoption evidence tracking;
  success = listing accepted and ≥3 independent adoption evidences (#27)

## Out of scope for G-1

These are intentionally deferred (see `docs/prd.md` → Out of Scope):

- **Experimental browser-assist** (Playwright-compatible screen reading, step
  guidance, user-approved clicks). The original KOI repository included an
  experimental `packages/browser-assist`; it is **excluded** from this G-1
  reimplementation and tracked here for a future milestone. If reintroduced it
  must remain clearly experimental and require explicit user approval before any
  navigation or click.
- HTTP/SSE gateway transport (core is already transport-neutral to allow it).
- Additional read-only page-extraction backends beyond the existing official
  live API adapters behind the `BenefitRepository` interface.
- Government24 login, identity verification, or form-submission automation
  (permanently out of scope).

## Candidate next steps (post-G-5)

- Add an HTTP/SSE transport adapter over `BenefitToolService` (core is already
  transport-neutral; becomes relevant only if a hosted deployment is ever
  wanted — not a current goal).
- Expand fixtures and consistency rules alongside new sources.
