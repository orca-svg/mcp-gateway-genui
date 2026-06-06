# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- G-1 MVP clean-room reimplementation using the KOI project as a specification:
  - `@mcp-gen-ui/schema` — Zod source of truth + JSON Schema export.
  - `@mcp-gen-ui/core` — fixture repository, rule-based recommender, SQLite
    snapshot/change-log store, plugin-style consistency rules, transport-neutral
    `BenefitToolService`.
  - `@mcp-gen-ui/mcp-server` — stdio MCP server exposing five tools.
  - `@mcp-gen-ui/demo-ui` — Vite + React renderer (domain JSON → A2UI adapter).
  - Fixture-first test suite and CI (build → typecheck → test).

### Changed

- Snapshot store uses Node's built-in `node:sqlite` instead of `better-sqlite3`,
  removing the native build dependency.

### Deferred

- Experimental browser-assist excluded from G-1 (tracked in `docs/roadmap.md`).
