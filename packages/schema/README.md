# @mcp-gen-ui/schema

Zod schemas for the mcp-gen-ui gateway public-benefit contracts, plus generated JSON Schema files for non-TypeScript clients.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Install

```bash
npm install @mcp-gen-ui/schema
```

## Usage

```ts
import { BenefitSearchRequestSchema, BenefitSearchResponseSchema } from '@mcp-gen-ui/schema';

const request = BenefitSearchRequestSchema.parse({
  query: 'housing support',
  profile: {},
});
```

Run `pnpm schemas` in the repository to regenerate the JSON Schema artifacts from the Zod source of truth.
