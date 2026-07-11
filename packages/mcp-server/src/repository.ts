import {
  BokjiroRepository,
  CachingBenefitRepository,
  CompositeBenefitRepository,
  SubsidyRepository,
  YouthCenterRepository,
  type BenefitSourceAdapter
} from "@mcp-gen-ui/adapters";
import {
  FixtureBenefitRepository,
  GatewayError,
  type BenefitRepository
} from "@mcp-gen-ui/core";
import { AdapterResultSchema, type AdapterResult, type DataStatus } from "@mcp-gen-ui/schema";

type LiveSource = "youth-center" | "bokjiro" | "subsidy24";

const LIVE_SOURCES: LiveSource[] = ["youth-center", "bokjiro", "subsidy24"];
const DATA_GO_KR_ORIGIN = "https://apis.data.go.kr";
const YOUTH_CENTER_ORIGIN = "https://www.youthcenter.go.kr";

export type RuntimeEnvironment = Record<string, string | undefined>;

export type BuildBenefitRepositoryOptions = {
  env?: RuntimeEnvironment;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  cacheNow?: () => number;
  logger?: { warn: (message: string) => void };
};

/** Compose the explicit fixture/live/mixed runtime without silent fallback. */
export function buildBenefitRepository(
  options: BuildBenefitRepositoryOptions = {}
): BenefitRepository {
  const env = options.env ?? process.env;
  const mode = resolveMode(env);
  const now = options.now ?? (() => new Date());

  if (mode === "fixture") {
    return new FixtureBenefitRepository(undefined, { now });
  }

  const sourceNames = resolveLiveSources(env);
  const liveAdapters = sourceNames.map((source) =>
    buildLiveAdapter(source, env, options)
  );
  const adapters: BenefitSourceAdapter[] =
    mode === "mixed"
      ? [new FixtureSourceAdapter(new FixtureBenefitRepository(undefined, { now })), ...liveAdapters]
      : liveAdapters;

  const composite = new CompositeBenefitRepository(adapters, {
    mode,
    now,
    warn: options.logger?.warn
  });
  return new CachingBenefitRepository(composite, {
    ttlMs: parseCacheTtl(env.MCP_GEN_UI_CACHE_TTL_MS),
    now: options.cacheNow
  });
}

function resolveMode(env: RuntimeEnvironment): DataStatus["mode"] {
  const raw = clean(env.MCP_GEN_UI_REPOSITORY_MODE);
  if (!raw) {
    if (env.NODE_ENV === "production") throw configurationError();
    return "fixture";
  }
  if (raw === "fixture" || raw === "live" || raw === "mixed") return raw;
  throw configurationError();
}

function resolveLiveSources(env: RuntimeEnvironment): LiveSource[] {
  const configured = clean(env.MCP_GEN_UI_LIVE_SOURCES);
  const sources = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : LIVE_SOURCES.filter((source) => Boolean(apiKeyFor(source, env)));

  if (sources.length === 0 || new Set(sources).size !== sources.length) {
    throw configurationError();
  }
  if (sources.some((source) => !LIVE_SOURCES.includes(source as LiveSource))) {
    throw configurationError();
  }
  for (const source of sources as LiveSource[]) {
    if (!apiKeyFor(source, env)) throw configurationError();
  }
  return sources as LiveSource[];
}

function buildLiveAdapter(
  source: LiveSource,
  env: RuntimeEnvironment,
  options: BuildBenefitRepositoryOptions
): BenefitSourceAdapter {
  const apiKey = apiKeyFor(source, env);
  if (!apiKey) throw configurationError();
  const endpoint = endpointFor(source, env);
  if (endpoint) validateEndpoint(endpoint, source);
  const common = {
    apiKey,
    endpoint,
    fetch: options.fetch,
    now: options.now,
    logger: options.logger
  };

  switch (source) {
    case "youth-center":
      return new YouthCenterRepository(common);
    case "bokjiro":
      return new BokjiroRepository(common);
    case "subsidy24":
      return new SubsidyRepository(common);
  }
}

function apiKeyFor(source: LiveSource, env: RuntimeEnvironment): string | undefined {
  switch (source) {
    case "youth-center":
      return clean(env.YOUTH_CENTER_API_KEY);
    case "bokjiro":
      return clean(env.BOKJIRO_API_KEY) ?? clean(env.DATA_GO_KR_API_KEY);
    case "subsidy24":
      return clean(env.SUBSIDY24_API_KEY) ?? clean(env.DATA_GO_KR_API_KEY);
  }
}

function endpointFor(source: LiveSource, env: RuntimeEnvironment): string | undefined {
  switch (source) {
    case "youth-center":
      return clean(env.YOUTH_CENTER_API_ENDPOINT);
    case "bokjiro":
      return clean(env.BOKJIRO_API_ENDPOINT);
    case "subsidy24":
      return clean(env.SUBSIDY24_API_ENDPOINT);
  }
}

function validateEndpoint(value: string, source: LiveSource): void {
  try {
    const url = new URL(value);
    const expectedOrigin =
      source === "youth-center" ? YOUTH_CENTER_ORIGIN : DATA_GO_KR_ORIGIN;
    if (
      url.protocol !== "https:" ||
      url.origin !== expectedOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw configurationError();
    }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw configurationError();
  }
}

function parseCacheTtl(value: string | undefined): number {
  if (!clean(value)) return 5 * 60 * 1000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 24 * 60 * 60 * 1000) {
    throw configurationError();
  }
  return parsed;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function configurationError(): GatewayError {
  return new GatewayError("configuration_error");
}

class FixtureSourceAdapter implements BenefitSourceAdapter {
  readonly sourceId = "fixture-benefits";
  readonly adapterVersion = "2.0.0-fixture";

  constructor(private readonly repository: FixtureBenefitRepository) {}

  async search(): Promise<AdapterResult> {
    const result = await this.repository.search();
    const observation = result.dataStatus.sources[0];
    if (!observation) throw configurationError();
    return AdapterResultSchema.parse({ records: result.records, observation });
  }
}
