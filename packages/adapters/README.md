# @mcp-gen-ui/adapters

Composable `BenefitRepository` adapters for bringing public Korean benefit data
into the gateway without changing MCP tool contracts.

## Exports

- `CompositeBenefitRepository` — fan-in over multiple repositories with stable
  deduplication by source URL/id.
- `CachingBenefitRepository` — TTL cache wrapper for on-demand repository reads.
- `YouthCenterRepository` — live adapter for the 온통청년 / 한국고용정보원 청년정책
  API (data.go.kr dataset 15143273).
- `BokjiroRepository` — live adapter for 복지로 / 한국사회보장정보원 public welfare services.
- `SubsidyRepository` — live adapter for 기획예산처/기획재정부 국고보조금 공모사업 (`MoefOpenAPI/T_OPD_PBNS`), kept under the `subsidy24` source id for compatibility.

## Live repositories

API keys are supplied at runtime only:

```ts
import {
  BokjiroRepository,
  CompositeBenefitRepository,
  SubsidyRepository,
  YouthCenterRepository
} from "@mcp-gen-ui/adapters";

const repository = new CompositeBenefitRepository([
  new YouthCenterRepository({ apiKey: process.env.YOUTH_CENTER_API_KEY }),
  new BokjiroRepository({ apiKey: process.env.BOKJIRO_API_KEY }),
  new SubsidyRepository({ apiKey: process.env.SUBSIDY24_API_KEY })
]);
```

If no key is supplied, or the live API call fails, each repository returns an
empty result set and emits a warning through the configured logger. Tests use
recorded fixtures and do not require live keys. Adapters normalize public policy
fields only (title, provider, public URLs, eligibility text, application periods,
regions, age bands, household hints, categories, and deadlines); they do not
persist keys or personal identifiers.
