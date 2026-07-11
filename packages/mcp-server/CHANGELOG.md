# @mcp-gen-ui/mcp-server

## 0.3.0

### Minor Changes

- 5d2fecf: Introduce the strict source-aware v2 benefit discovery contract: draft 2020-12 schemas and representative fixtures, separated assessment and relative relevance ranking, field provenance and verified links, fail-closed runtime modes, adapter implementations for the documented 온통청년 and Bokjiro contracts plus the compatibility-named `subsidy24` adapter for 기획예산처 national-subsidy open calls, explicit atomic ingestion/change history, and fully declared MCP tools. YouthCenter live activation still requires verification with an issued production key.

### Patch Changes

- Updated dependencies [5d2fecf]
  - @mcp-gen-ui/schema@0.3.0
  - @mcp-gen-ui/core@0.3.0
  - @mcp-gen-ui/adapters@0.3.0

## 0.2.0

### Minor Changes

- a0101c0: Replace the provisional recommendation persona ids with the built-in persona registry (`youth_jobseeker`, `university_student`, `newlywed_family`, `single_parent`, `senior`, `general`), expose `resolveWeights` and `listPersonas`, and make request-level score weights merge on top of persona presets.
- 3a902dd: Add application deadline support to benefit records and expose the `getUpcomingDeadlines` MCP tool for retrieving deadline-bearing recommendations sorted by soonest deadline.

### Patch Changes

- Updated dependencies [5bb8387]
- Updated dependencies [a0101c0]
- Updated dependencies [3a902dd]
- Updated dependencies [3a902dd]
  - @mcp-gen-ui/core@0.2.0
  - @mcp-gen-ui/schema@0.2.0
