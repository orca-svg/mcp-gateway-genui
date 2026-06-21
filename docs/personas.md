# Persona weighting model

The gateway ranks benefits with a deterministic, LLM-free scoring model. A host may pass a `profile.persona` value to select one of the built-in presets, and may pass `weights` overrides when it needs an explicit product-specific adjustment.

Recommendations remain **candidates, not eligibility decisions**. Persona weights only affect ordering and score explanations; they do not bypass hard blockers or turn missing eligibility facts into confirmed eligibility.

## Score dimensions

Each benefit receives a `score` between `0` and `1` plus a `scoreBreakdown` array. Every breakdown item includes:

- `dimension`: one of `region`, `age`, `student`, `employment`, `household`, `category`, or `query`.
- `signal`: the normalized match signal for that dimension (`0` to `1`).
- `weight`: the active persona/override weight.
- `contribution`: `signal * weight` for that dimension.
- `explanation`: the user-readable reason for the contribution.

The final score is the normalized weighted contribution across active dimensions. Scores are ranking aids for the UI and host; the response still uses candidate-framed statuses (`candidate`, `needs_more_info`, `not_applicable`) and missing-info prompts.

## Weight resolution contract

1. If `profile.persona` is present, the gateway loads that preset from `defaultPersonaRegistry`.
2. If no persona is present, `general` is used.
3. Request-level `weights` override only the specified dimensions on top of the preset.
4. Unknown/replaceable registries are an embedder concern; the public presets below are the built-in defaults.

## Built-in personas

| Persona | Weights | Rationale |
| --- | --- | --- |
| `general` | region 1, age 1, student 1, employment 1, household 1, category 1, query 1 | Backward-compatible neutral ranking. No dimension is favored, making it a safe default when the host has not asked the user to choose a persona. |
| `youth_jobseeker` | region 1, age 2, student 1, employment 3, household 1, category 1.5, query 2 | Job-seeking youth usually need programs that match employment status and age bounds. Query intent is also emphasized because users often mention job training, hiring, or stipend needs directly. |
| `university_student` | region 1, age 2, student 3, employment 1, household 1, category 2, query 1 | Student status is the strongest signal for scholarships, tuition support, dormitory/housing, and campus-adjacent benefits. Age and category are elevated to prefer college-age education/housing matches. |
| `newlywed_family` | region 2, age 1.5, student 1, employment 1, household 3, category 2, query 1 | Household composition is central for newlywed housing and family-formation programs. Region and category matter because many benefits are local and housing/family scoped. |
| `single_parent` | region 2, age 1, student 1, employment 1.5, household 3, category 2, query 1 | Single-parent programs depend heavily on household type. Region, family category, and employment context help prioritize local support and work/childcare-adjacent benefits. |
| `senior` | region 1.5, age 3, student 1, employment 1, household 1, category 2, query 1 | Senior-focused programs are usually age-gated. Region and category are raised to surface local welfare, health, care, and community-service benefits. |

## Public API fields

`searchBenefits` accepts persona and weight inputs through the existing request shape:

```json
{
  "query": "서울 거주 대학생 지원",
  "profile": {
    "region": "서울",
    "ageRange": "twenties",
    "studentStatus": "student",
    "persona": "university_student",
    "interests": ["education", "housing"]
  },
  "weights": {
    "query": 1.5
  }
}
```

`searchBenefits` and `getUpcomingDeadlines` return `score` and `scoreBreakdown` on each result so clients can render score bars, explain why a result ranked highly, and show which facts still need verification.
