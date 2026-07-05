import { FixtureBenefitRepository, type BenefitRepository } from "@mcp-gen-ui/core";
import {
  BokjiroRepository,
  CachingBenefitRepository,
  CompositeBenefitRepository,
  SubsidyRepository,
  YouthCenterRepository
} from "@mcp-gen-ui/adapters";

const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface ServerRepositoryEnv {
  YOUTH_CENTER_API_KEY?: string;
  BOKJIRO_API_KEY?: string;
  SUBSIDY24_API_KEY?: string;
  DATA_GO_KR_API_KEY?: string;
  MCP_GEN_UI_FIXTURES?: string;
}

export interface BuildBenefitRepositoryOptions {
  env?: ServerRepositoryEnv;
  fetch?: typeof fetch;
  warn?: (message: string) => void;
  now?: () => Date;
  cacheNow?: () => number;
}

/**
 * Builds the stdio server repository stack.
 *
 * Zero-config remains fixture-only. Supplying any supported government API key
 * opts the server into live repositories, fanned in with fixtures as a fallback
 * unless MCP_GEN_UI_FIXTURES=off is set.
 */
export function buildBenefitRepository(options: BuildBenefitRepositoryOptions = {}): BenefitRepository {
  const env = options.env ?? process.env;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const logger = { warn };
  const fetchImpl = options.fetch;
  const now = options.now;

  const youthCenterKey = cleanKey(env.YOUTH_CENTER_API_KEY);
  const dataGoKrKey = cleanKey(env.DATA_GO_KR_API_KEY);
  const bokjiroKey = cleanKey(env.BOKJIRO_API_KEY) ?? dataGoKrKey;
  const subsidy24Key = cleanKey(env.SUBSIDY24_API_KEY) ?? dataGoKrKey;

  const liveRepositories: BenefitRepository[] = [];
  if (bokjiroKey) {
    liveRepositories.push(new BokjiroRepository({ apiKey: bokjiroKey, fetch: fetchImpl, logger, now }));
  }
  if (subsidy24Key) {
    liveRepositories.push(new SubsidyRepository({ apiKey: subsidy24Key, fetch: fetchImpl, logger, now }));
  }
  if (youthCenterKey) {
    liveRepositories.push(new YouthCenterRepository({ apiKey: youthCenterKey, fetch: fetchImpl, logger, now }));
  }

  if (liveRepositories.length === 0) {
    return new FixtureBenefitRepository();
  }

  const repositories = [...liveRepositories];
  if (!fixturesDisabled(env.MCP_GEN_UI_FIXTURES)) {
    repositories.push(new FixtureBenefitRepository());
  }

  return new CachingBenefitRepository(
    new CompositeBenefitRepository(repositories, { warn }),
    { ttlMs: LIVE_CACHE_TTL_MS, now: options.cacheNow }
  );
}

function cleanKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fixturesDisabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "off";
}
