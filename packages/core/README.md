# @mcp-gen-ui/core

Transport-neutral public-benefit business logic for the mcp-gen-ui gateway.

It includes the fixture-backed benefit repository, rule-based recommendation engine, SQLite snapshot/change-log support, consistency checks, and `BenefitToolService` used by MCP transports.

## Install

```bash
npm install @mcp-gen-ui/core
```

## Usage

```ts
import { BenefitToolService, FixtureBenefitRepository } from '@mcp-gen-ui/core';

const service = new BenefitToolService(new FixtureBenefitRepository());
```

The package is LLM-free and keeps recommendations as candidates, not definitive eligibility decisions.
