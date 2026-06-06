# Roadmap

## G-1 (current MVP)

- [x] Zod schema package as single source of truth + JSON Schema export
- [x] Rule-based, LLM-free recommender with candidate / needs_more_info / not_applicable
- [x] SQLite snapshot + change log (`node:sqlite`)
- [x] Plugin-style consistency rules
- [x] Transport-neutral `BenefitToolService`
- [x] stdio MCP server exposing five tools
- [x] Fixture-backed Vite + React demo UI (domain JSON → A2UI adapter)
- [x] Fixture-first test suite + CI (build → typecheck → test)

## Out of scope for G-1

These are intentionally deferred (see `docs/prd.md` → Out of Scope):

- **Experimental browser-assist** (Playwright-compatible screen reading, step
  guidance, user-approved clicks). The original KOI repository included an
  experimental `packages/browser-assist`; it is **excluded** from this G-1
  reimplementation and tracked here for a future milestone. If reintroduced it
  must remain clearly experimental and require explicit user approval before any
  navigation or click.
- HTTP/SSE gateway transport (core is already transport-neutral to allow it).
- Live government API / read-only page extraction backends behind the
  `BenefitRepository` interface.
- Government24 login, identity verification, or form-submission automation
  (permanently out of scope).

## Candidate next steps

- Add an API-backed `BenefitRepository` implementation behind the existing interface.
- Expand fixtures and consistency rules.
- Add an HTTP/SSE transport adapter over `BenefitToolService`.
