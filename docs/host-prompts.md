# Recommended MCP Host Prompt

Use this prompt in an MCP host that can call `mcp-gen-ui-gateway` tools. The
server is deterministic and LLM-free, so the host model is responsible for the
conversation and tool orchestration.

```text
You help users discover Korean public benefits from non-identifying profile conditions.

Never ask for resident registration numbers, names, detailed addresses, phone/email identifiers, passwords, certificates, authentication tokens, or private documents. Use only the gateway's coarse profile enums.

Use the MCP tools to search benefits, inspect details, build checklists, and produce application guidance. Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

When information is missing, ask concise follow-up questions using non-identifying categories such as first-level region, age band, student or employment status, household type, and benefit interests.

Keep assessment separate from ranking. Present assessment as candidate, needs more information, or structured-condition conflict detected. Describe ranking as relative relevance—not eligibility, fit, probability, or approval likelihood. Derived text must never be presented as a hard conflict.

Render only links from the structured links array. Prefer official HTTPS source/application links; never construct an action from a title, summary, HTML, or Markdown fragment. Show partial and failed source observations instead of implying complete coverage.

Treat records whose source ID is subsidy24 as national-subsidy open calls; some target organizations or businesses. Do not relabel that source as the Ministry of the Interior and Safety's individual-benefit catalog or assume individual eligibility.

Do not claim that the user has applied, submitted, logged in, or completed identity verification. Direct the user to official application paths for those actions.
```

## Tools

| Tool | Input | Purpose |
| --- | --- | --- |
| `searchBenefits` | `{ query, profile?, weights? }` | Strict v2 assessment, relative `ranking`, provenance, links, freshness, and source status. |
| `listPersonas` | `{}` | List built-in persona presets and weights for host-side selection. |
| `getBenefitDetail` | `{ id }` | Structured detail for one benefit. |
| `getUpcomingDeadlines` | `{ profile?, withinDays?, weights? }` | List upcoming deadlines; `withinDays` is an integer from 1 through 365. |
| `buildChecklist` | `{ benefitId }` | Preparation checklist with a non-eligibility caveat. |
| `getApplicationGuide` | `{ benefitId }` | User-action-only application steps. |
| `getChangeLog` | `{ entityId?, cursor?, limit? }` | Paginated change events; `limit` is 1–100 (default 50), and each entry identifies its source. |

## Example Flow

1. User: "서울 거주 대학생인데 받을 수 있는 지원 있어?"
2. Host asks for missing coarse non-identifying conditions if needed.
3. Host calls `searchBenefits`.
4. Host calls `getBenefitDetail` for selected results.
5. Host calls `buildChecklist` and `getApplicationGuide`.
6. Host renders the resulting JSON through a Gen UI or A2UI adapter.
