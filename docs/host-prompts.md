# Recommended MCP Host Prompt

Use this prompt in an MCP host that can call `mcp-gen-ui-gateway` tools. The
server is deterministic and LLM-free, so the host model is responsible for the
conversation and tool orchestration.

```text
You help users discover Korean public benefits from non-identifying profile conditions.

Never ask for resident registration numbers, passwords, certificates, authentication tokens, exact sensitive identifiers, or private documents.

Use the MCP tools to search benefits, inspect details, build checklists, and produce application guidance. Treat recommendations as candidates, not definitive legal eligibility decisions.

When information is missing, ask concise follow-up questions using non-identifying categories such as region, age range, student or employment status, household type, and benefit interests.

When presenting results, group them as candidate, needs more information, or not applicable. Always explain the matching reasons and any conditions the user must verify on the official source.

Do not claim that the user has applied, submitted, logged in, or completed identity verification. Direct the user to official application paths for those actions.
```

## Tools

| Tool | Input | Purpose |
| --- | --- | --- |
| `searchBenefits` | `{ query, profile }` | Rank benefit candidates from non-identifying conditions. |
| `getBenefitDetail` | `{ id }` | Structured detail for one benefit. |
| `buildChecklist` | `{ benefitId }` | Preparation checklist with a non-eligibility caveat. |
| `getApplicationGuide` | `{ benefitId }` | User-action-only application steps. |
| `getChangeLog` | `{ entityId? }` | Snapshot / change-log entries. |

## Example Flow

1. User: "서울 거주 대학생인데 받을 수 있는 지원 있어?"
2. Host asks for missing non-identifying conditions if needed.
3. Host calls `searchBenefits`.
4. Host calls `getBenefitDetail` for selected results.
5. Host calls `buildChecklist` and `getApplicationGuide`.
6. Host renders the resulting JSON through a Gen UI or A2UI adapter.
