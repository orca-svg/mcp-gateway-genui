# @mcp-gen-ui/adapters

Composable `BenefitRepository` adapters for bringing public Korean benefit data
into the gateway without changing MCP tool contracts.

## Exports

- `CompositeBenefitRepository` — fan-in over multiple repositories with stable
  deduplication by source URL/id.
- `CachingBenefitRepository` — TTL cache wrapper for on-demand repository reads.
- `YouthCenterRepository` — live adapter for the 온통청년 / 한국고용정보원 청년정책
  API (data.go.kr dataset 15143273).

## YouthCenterRepository

API keys are supplied at runtime only:

```ts
import { YouthCenterRepository } from "@mcp-gen-ui/adapters";

const repository = new YouthCenterRepository({
  apiKey: process.env.YOUTH_CENTER_API_KEY
});
```

If no key is supplied, or the live API call fails, the repository returns an
empty result set and emits a warning through the configured logger. Tests use
recorded fixtures and do not require a live key.
