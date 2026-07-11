# Recommendation personas

`@mcp-gen-ui/core` ships a small registry of built-in **persona presets** that
tune the recommendation scoring weights for a given audience. They are
intentionally documented (not hidden policy): an embedder can replace the
registry, and a host can let users pick a persona via the `listPersonas` MCP
tool.

- Each preset assigns a weight to every scoring dimension. `general` is the
  backward-compatible uniform-weight default (all dimensions `1`).
- A higher weight makes that dimension matter more in ranking. Request weights
  may set a dimension to zero; if all effective weights are zero, every score is
  zero and opaque IDs provide deterministic ordering.
- Request-level `weights` are merged on top of the selected persona via
  `resolveWeights(persona, overrides)`, so a host can fine-tune without
  redefining a preset.

Recommendations remain candidates, not eligibility decisions, regardless of the
persona in effect.

Personas and request weights change relative ranking only. They never change a
candidate's assessment or turn text-derived evidence into a hard conflict.

## Built-in presets

Scoring dimensions: `region`, `age`, `student`, `employment`, `household`,
`category`, `query`.

| Persona | region | age | student | employment | household | category | query | Audience |
|---|---|---|---|---|---|---|---|---|
| `youth_jobseeker` | 1 | 2 | 1 | 3 | 1 | 1.5 | 2 | Youth job seekers: employment/age signals and query intent |
| `university_student` | 1 | 2 | 3 | 1 | 1 | 2 | 1 | University students: student/age signals and category |
| `newlywed_family` | 2 | 1.5 | 1 | 1 | 3 | 2 | 1 | Newlywed families: household, housing/category, region |
| `single_parent` | 2 | 1 | 1 | 1.5 | 3 | 2 | 1 | Single-parent households: household, family/category, region, employment |
| `senior` | 1.5 | 3 | 1 | 1 | 1 | 2 | 1 | Seniors: age/regional signals and category |
| `general` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | General-purpose uniform default |

## Usage

```ts
import { BenefitToolService, resolveWeights } from "@mcp-gen-ui/core";

// Pick a persona per request via the user profile…
await service.searchBenefits({
  query: "서울 거주 대학생 지원",
  profile: { regionCode: "KR-11", studentStatus: "student", persona: "university_student" }
});

// …list the presets a host can surface for selection…
const presets = await service.listPersonas();

// …or replace the registry for an embedder-specific deployment.
const service = new BenefitToolService(repository, undefined, {
  personas: { custom: { id: "custom", description: "…", weights: resolveWeights("general") } }
});
```

See also [`docs/extending.md`](extending.md) for bring-your-own-data-source
integration.
