# @mcp-gen-ui/core

## 0.2.0

### Minor Changes

- 5bb8387: Normalize `applicationDeadline` values to KST and export the `kstDeadlineToUtc` helper so embedders can resolve deadline timezones consistently.
- a0101c0: Replace the provisional recommendation persona ids with the built-in persona registry (`youth_jobseeker`, `university_student`, `newlywed_family`, `single_parent`, `senior`, `general`), expose `resolveWeights` and `listPersonas`, and make request-level score weights merge on top of persona presets.
- 3a902dd: Add persona-weighted recommendation scoring contracts and behavior, including `score` and `scoreBreakdown` on benefit summaries, `persona` on user profiles, per-request scoring `weights`, and `householdTypes` on benefit records.
- 3a902dd: Add application deadline support to benefit records and expose the `getUpcomingDeadlines` MCP tool for retrieving deadline-bearing recommendations sorted by soonest deadline.

### Patch Changes

- Updated dependencies [a0101c0]
- Updated dependencies [3a902dd]
- Updated dependencies [3a902dd]
  - @mcp-gen-ui/schema@0.2.0
