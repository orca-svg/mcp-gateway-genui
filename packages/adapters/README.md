# @mcp-gen-ui/adapters

Composable `BenefitRepository` adapters for bringing public Korean program data
into the gateway without changing MCP tool contracts.

## Exports

- `CompositeBenefitRepository` — source-aware fan-in with stable record-ID
  deduplication and per-source observations.
- `CachingBenefitRepository` — TTL cache wrapper for on-demand repository reads.
- `YouthCenterRepository` — live adapter for the 온통청년 / 한국고용정보원 청년정책
  API (data.go.kr dataset 15143273).
- `BokjiroRepository` — live adapter for 복지로 / 한국사회보장정보원 public welfare services.
- `SubsidyRepository` — live adapter for 기획예산처 국고보조금 공모사업 상세.

The runtime source ID for `SubsidyRepository` remains `subsidy24` for contract
compatibility. It is not the 행정안전부 보조금24 individual-benefit catalog;
the backing source is the 기획예산처 national-subsidy open-call dataset.

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

Each adapter returns `{ records, observation }`. Missing configuration,
timeouts, upstream errors, invalid envelopes, rejected records, and bounded
pages are represented by stable observation status/error codes; they are not
silently converted into a successful empty source. Tests use deterministic
contract fixtures modeled on official envelopes and do not require live keys.

The transport permits only each adapter's exact HTTPS origin, enforces response
content type and payload bounds, supports abort/timeout and bounded retries, and
never exposes keys in stable errors. Records include field-level provenance,
source revision/content hash, the freshness input `lastFetchedAt`, and
structured verified links. Public candidate projection derives `freshness`
from that timestamp.
Text-derived region/age/household hints remain `derived_text` evidence and
cannot create a hard eligibility conflict.
