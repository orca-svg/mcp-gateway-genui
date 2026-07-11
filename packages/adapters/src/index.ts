import { createRequire } from "node:module";
import { isIP } from "node:net";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  hashCanonicalJson,
  kstDeadlineToUtc,
  sha256Hex,
  type BenefitRepository
} from "@mcp-gen-ui/core";
import {
  AdapterResultSchema,
  BenefitRecordSchema,
  BenefitRepositoryDetailResultSchema,
  BenefitRepositoryResultSchema,
  DISPLAY_TEXT_LIMITS,
  OPAQUE_ID_PATTERN,
  VersionStringSchema,
  normalizeDisplayText,
  type AdapterResult,
  type AgeBand,
  type BenefitCategory,
  type BenefitRecord,
  type BenefitRepositoryDetailResult,
  type BenefitRepositoryResult,
  type BenefitRule,
  type DataStatus,
  type EvidenceBasis,
  type ProvenanceRecord,
  type RegionCode,
  type SourceObservation,
  type VerifiedLink
} from "@mcp-gen-ui/schema";
import {
  AdapterTransportError,
  fetchAdapterResource,
  type AdapterTransportErrorCode
} from "./transport.js";

export {
  ADAPTER_TRANSPORT_ERROR_CODES,
  AdapterTransportError,
  fetchAdapterResource
} from "./transport.js";
export type {
  AdapterTransportErrorCode,
  AdapterTransportRequest,
  AdapterTransportResponse
} from "./transport.js";

const nodeRequire = createRequire(import.meta.url);
const adapterPackage = nodeRequire("../package.json") as { version: string };

export const ADAPTER_VERSION = adapterPackage.version;

const SOURCE_REVISIONS = {
  "youth-center": "2026.07.10",
  bokjiro: "2026.01.26",
  subsidy24: "2025.12.30"
} as const;

const DATA_GO_KR_ORIGIN = "https://apis.data.go.kr";
const YOUTH_CENTER_ORIGIN = "https://www.youthcenter.go.kr";
const DEFAULT_LINK_STALE_AFTER_DAYS = 365;

type SourceId = keyof typeof SOURCE_REVISIONS;
type SourceItem = Record<string, unknown>;
type LinkRelation = VerifiedLink["rel"];

export interface AdapterSearchOptions {
  signal?: AbortSignal;
}

export interface BenefitSourceAdapter {
  readonly sourceId: string;
  readonly adapterVersion: string;
  search(options?: AdapterSearchOptions): Promise<AdapterResult>;
}

export interface CompositeBenefitRepositoryOptions {
  mode?: DataStatus["mode"];
  now?: () => Date;
  warn?: (message: string) => void;
}

export class CompositeBenefitRepository implements BenefitRepository {
  readonly mode: DataStatus["mode"];
  private readonly adapters: BenefitSourceAdapter[];
  private readonly now: () => Date;
  private readonly warn?: (message: string) => void;

  constructor(
    adapters: BenefitSourceAdapter[],
    options: CompositeBenefitRepositoryOptions = {}
  ) {
    if (
      !Array.isArray(adapters) ||
      adapters.length === 0 ||
      adapters.some((adapter) => !isValidSourceAdapter(adapter)) ||
      new Set(adapters.map((adapter) => adapter.sourceId)).size !== adapters.length ||
      (options.mode !== undefined && !["fixture", "live", "mixed"].includes(options.mode)) ||
      (options.now !== undefined && typeof options.now !== "function") ||
      (options.warn !== undefined && typeof options.warn !== "function")
    ) {
      throw new AdapterTransportError("invalid_configuration");
    }
    this.adapters = [...adapters];
    this.mode = options.mode ?? "live";
    this.now = options.now ?? (() => new Date());
    this.warn = options.warn;
  }

  async search(): Promise<BenefitRepositoryResult> {
    const results = await Promise.all(
      this.adapters.map((adapter) => this.safeSearch(adapter))
    );
    const records = dedupeRecords(results.flatMap((result) => result.records));
    const sources = results.map((result) => result.observation);

    return BenefitRepositoryResultSchema.parse({
      records,
      dataStatus: {
        mode: this.mode,
        partial: sources.some((source) => source.status !== "ok"),
        sources
      }
    });
  }

  async getById(id: string): Promise<BenefitRepositoryDetailResult> {
    const result = await this.search();
    return BenefitRepositoryDetailResultSchema.parse({
      record: result.records.find((record) => record.id === id),
      dataStatus: result.dataStatus
    });
  }

  private async safeSearch(adapter: BenefitSourceAdapter): Promise<AdapterResult> {
    try {
      const result = AdapterResultSchema.parse(await adapter.search());
      if (result.observation.sourceId !== adapter.sourceId) {
        safeWarn(this.warn, `${adapter.sourceId}:source_mismatch`);
        return failedAdapterResult(
          adapter.sourceId,
          adapter.adapterVersion,
          safeNowIso(this.now),
          "invalid_payload",
          "source_mismatch"
        );
      }
      if (
        result.observation.adapterVersion !== adapter.adapterVersion ||
        result.observation.recordCount !== result.records.length ||
        result.records.some((record) => record.sourceId !== adapter.sourceId)
      ) {
        safeWarn(this.warn, `${adapter.sourceId}:invalid_payload`);
        return failedAdapterResult(
          adapter.sourceId,
          adapter.adapterVersion,
          safeNowIso(this.now),
          "invalid_payload",
          "invalid_payload"
        );
      }
      return result;
    } catch {
      safeWarn(this.warn, `${adapter.sourceId}:adapter_failure`);
      return failedAdapterResult(
        adapter.sourceId,
        adapter.adapterVersion,
        safeNowIso(this.now),
        "unavailable",
        "adapter_failure"
      );
    }
  }
}

export interface CachingBenefitRepositoryOptions {
  ttlMs: number;
  now?: () => number;
}

export class CachingBenefitRepository implements BenefitRepository {
  readonly mode: DataStatus["mode"];
  private searchCache?: { expiresAt: number; result: BenefitRepositoryResult };
  private readonly now: () => number;

  constructor(
    private readonly repository: BenefitRepository,
    private readonly options: CachingBenefitRepositoryOptions
  ) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new AdapterTransportError("invalid_configuration");
    }
    this.mode = repository.mode;
    this.now = options.now ?? Date.now;
  }

  async search(): Promise<BenefitRepositoryResult> {
    const current = this.safeNow();
    if (this.searchCache && this.searchCache.expiresAt > current) {
      return this.searchCache.result;
    }

    const result = BenefitRepositoryResultSchema.parse(await this.repository.search());
    this.searchCache = {
      result,
      expiresAt: current + this.options.ttlMs
    };
    return result;
  }

  async getById(id: string): Promise<BenefitRepositoryDetailResult> {
    const result = await this.search();
    return BenefitRepositoryDetailResultSchema.parse({
      record: result.records.find((record) => record.id === id),
      dataStatus: result.dataStatus
    });
  }

  private safeNow(): number {
    const value = this.now();
    if (!Number.isFinite(value)) {
      throw new AdapterTransportError("invalid_configuration");
    }
    return value;
  }
}

interface PublicBenefitAdapterOptions {
  apiKey?: string;
  endpoint?: string;
  pageSize?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  logger?: { warn: (message: string) => void };
  timeoutMs?: number;
  maxRetries?: number;
  maxPayloadBytes?: number;
  retryDelayMs?: number;
  linkStaleAfterDays?: number;
}

export interface YouthCenterRepositoryOptions extends PublicBenefitAdapterOptions {}
export interface BokjiroRepositoryOptions extends PublicBenefitAdapterOptions {}
export interface SubsidyRepositoryOptions extends PublicBenefitAdapterOptions {}

interface TextHit {
  field: string;
  value: string;
}

interface ParsedSourcePayload {
  items: SourceItem[];
  totalCount: number;
}

interface SourceMapping {
  sourceId: SourceId;
  envName: string;
  defaultEndpoint: string;
  requestOrigins: string[];
  sourceLabel: string;
  defaultProvider: string;
  sourceRevision: string;
  attribution: string;
  license: string;
  responseContentTypes: string[];
  maximumPageSize: number;
  idFields: string[];
  titleFields: string[];
  providerFields: string[];
  summaryFields: string[];
  targetFields: string[];
  eligibilityFields: string[];
  exclusionFields: string[];
  applicationPeriodFields: string[];
  applicationPeriodStartFields: string[];
  applicationPeriodEndFields: string[];
  applicationDeadlineFields: string[];
  documentFields: string[];
  applicationMethodFields: string[];
  searchableFields: string[];
  sourceLinkFields: string[];
  applyLinkFields: string[];
  staleDateFields: string[];
  structuredRegionFields: string[];
  structuredAgeMinFields: string[];
  structuredAgeMaxFields: string[];
  derivedConstraintFields: string[];
  officialOrigins: Record<LinkRelation, string[]>;
  fallbackSourceUrl: (sourceRecordId: string) => string;
  queryParams: (
    apiKey: string,
    pageSize: number,
    currentDate: Date
  ) => Record<string, string>;
  parsePayload: (body: string) => ParsedSourcePayload;
}

const YOUTH_CENTER_MAPPING: SourceMapping = {
  sourceId: "youth-center",
  envName: "YOUTH_CENTER_API_KEY",
  defaultEndpoint: `${YOUTH_CENTER_ORIGIN}/go/ythip/getPlcy`,
  requestOrigins: [YOUTH_CENTER_ORIGIN],
  sourceLabel: "YouthCenter",
  defaultProvider: "한국고용정보원",
  sourceRevision: SOURCE_REVISIONS["youth-center"],
  attribution: "온통청년·한국고용정보원",
  license: "공공데이터포털 이용허락범위 제한 없음",
  responseContentTypes: ["application/json"],
  maximumPageSize: 500,
  idFields: ["plcyNo", "policyNo", "bizId"],
  titleFields: ["plcyNm", "policyName", "title"],
  providerFields: ["sprvsnInstCdNm", "operInstCdNm", "provider"],
  summaryFields: ["plcyExplnCn", "plcySprtCn"],
  targetFields: ["addAplyQlfcCndCn", "earnEtcCn"],
  eligibilityFields: ["addAplyQlfcCndCn", "earnEtcCn"],
  exclusionFields: ["ptcpPrpTrgtCn"],
  applicationPeriodFields: ["aplyYmd", "aplyPrd"],
  applicationPeriodStartFields: [],
  applicationPeriodEndFields: [],
  applicationDeadlineFields: ["aplyYmd", "aplyPrd"],
  documentFields: ["sbmsnDcmntCn", "documents"],
  applicationMethodFields: ["plcyAplyMthdCn"],
  searchableFields: [
    "plcyKywdNm",
    "plcyExplnCn",
    "plcySprtCn",
    "addAplyQlfcCndCn",
    "earnEtcCn",
    "lclsfNm",
    "mclsfNm"
  ],
  sourceLinkFields: ["refUrlAddr1", "refUrlAddr2"],
  applyLinkFields: ["aplyUrlAddr"],
  staleDateFields: ["lastMdfcnDt"],
  structuredRegionFields: ["zipCd"],
  structuredAgeMinFields: ["sprtTrgtMinAge"],
  structuredAgeMaxFields: ["sprtTrgtMaxAge"],
  derivedConstraintFields: [
    "plcyNm",
    "plcyExplnCn",
    "plcySprtCn",
    "addAplyQlfcCndCn",
    "earnEtcCn",
    "plcyKywdNm"
  ],
  officialOrigins: {
    source: ["https://www.youthcenter.go.kr", "https://www.data.go.kr"],
    apply: ["https://www.youthcenter.go.kr"]
  },
  fallbackSourceUrl: (id) =>
    `${YOUTH_CENTER_ORIGIN}/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${encodeURIComponent(id)}`,
  queryParams: (apiKey, pageSize) => ({
    apiKeyNm: apiKey,
    pageNum: "1",
    pageSize: String(pageSize),
    pageType: "1",
    rtnType: "json"
  }),
  parsePayload: parseYouthCenterPayload
};

const BOKJIRO_MAPPING: SourceMapping = {
  sourceId: "bokjiro",
  envName: "BOKJIRO_API_KEY",
  defaultEndpoint: `${DATA_GO_KR_ORIGIN}/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001`,
  requestOrigins: [DATA_GO_KR_ORIGIN],
  sourceLabel: "Bokjiro",
  defaultProvider: "한국사회보장정보원",
  sourceRevision: SOURCE_REVISIONS.bokjiro,
  attribution: "복지로·한국사회보장정보원",
  license: "공공데이터포털 이용허락범위 제한 없음",
  responseContentTypes: ["application/xml", "text/xml"],
  maximumPageSize: 500,
  idFields: ["servId"],
  titleFields: ["servNm"],
  providerFields: ["jurMnofNm", "jurOrgNm"],
  summaryFields: ["servDgst"],
  targetFields: ["trgterIndvdlArray", "lifeArray"],
  eligibilityFields: ["trgterIndvdlArray", "lifeArray"],
  exclusionFields: [],
  applicationPeriodFields: [],
  applicationPeriodStartFields: [],
  applicationPeriodEndFields: [],
  applicationDeadlineFields: [],
  documentFields: [],
  applicationMethodFields: [],
  searchableFields: ["intrsThemaArray", "lifeArray", "trgterIndvdlArray", "servDgst"],
  sourceLinkFields: ["servDtlLink"],
  applyLinkFields: [],
  staleDateFields: [],
  structuredRegionFields: [],
  structuredAgeMinFields: [],
  structuredAgeMaxFields: [],
  derivedConstraintFields: ["servNm", "servDgst", "lifeArray", "trgterIndvdlArray", "intrsThemaArray"],
  officialOrigins: {
    source: ["https://www.bokjiro.go.kr", "https://www.data.go.kr"],
    apply: ["https://www.bokjiro.go.kr"]
  },
  fallbackSourceUrl: () => "https://www.data.go.kr/data/15090532/openapi.do",
  queryParams: (apiKey, pageSize) => ({
    serviceKey: apiKey,
    callTp: "L",
    pageNo: "1",
    numOfRows: String(pageSize),
    srchKeyCode: "003"
  }),
  parsePayload: parseBokjiroPayload
};

const SUBSIDY_MAPPING: SourceMapping = {
  sourceId: "subsidy24",
  envName: "SUBSIDY24_API_KEY",
  defaultEndpoint: `${DATA_GO_KR_ORIGIN}/1051000/MoefOpenAPI2025/T_OPD_ASBS_PBNS_UNITY`,
  requestOrigins: [DATA_GO_KR_ORIGIN],
  sourceLabel: "SubsidyOpenCall",
  defaultProvider: "기획예산처",
  sourceRevision: SOURCE_REVISIONS.subsidy24,
  attribution: "기획예산처 국고보조금 공모사업 상세",
  license: "공공데이터포털 이용허락범위 제한 없음",
  responseContentTypes: ["application/json"],
  maximumPageSize: 1_000,
  idFields: ["DTLBZ_DDTLBZ_ID", "DDTLBZ_ID", "DTLBZ_ID"],
  titleFields: ["PBLANC_NM", "DDTLBZ_NM", "DTLBZ_NM"],
  providerFields: ["DLVPL_NM", "JRSD_NM"],
  summaryFields: ["SPORT_CN_DC", "DDTLBZ_BSNS_PURPS_DC", "DTLBZ_BSNS_PURPS_DC"],
  targetFields: ["SPORT_TRGET_CN", "SPORT_CND_CN"],
  eligibilityFields: ["SPORT_CND_CN", "SLCTN_STDR_DC"],
  exclusionFields: ["EXCL_TRGET_CN"],
  applicationPeriodFields: ["RCEPT_PD_DC"],
  applicationPeriodStartFields: ["RCEPT_BEGIN_DE", "PBLANC_BEGIN_DE"],
  applicationPeriodEndFields: ["RCEPT_END_DE", "PBLANC_END_DE"],
  applicationDeadlineFields: ["RCEPT_END_DE", "PBLANC_END_DE"],
  documentFields: ["PRESENTN_PAPERS_GUIDANCE_CN"],
  applicationMethodFields: ["REQST_RCEPT_MTH_CN"],
  searchableFields: [
    "PBLANC_NM",
    "DTLBZ_NM",
    "DDTLBZ_NM",
    "SPORT_CN_DC",
    "SPORT_CND_CN",
    "SPORT_TRGET_CN",
    "SLCTN_STDR_DC"
  ],
  sourceLinkFields: ["PBLANC_POPUP_URL", "BSNS_GUIDANCE_URL", "BSNS_POPUP_URL"],
  applyLinkFields: [],
  staleDateFields: ["STDR_DE", "PBLANC_UPDT_DT", "DDTLBZ_UPDT_DT"],
  structuredRegionFields: ["CTPRVN_NM"],
  structuredAgeMinFields: [],
  structuredAgeMaxFields: [],
  derivedConstraintFields: [
    "PBLANC_NM",
    "DTLBZ_NM",
    "DDTLBZ_NM",
    "SPORT_CN_DC",
    "SPORT_CND_CN",
    "SPORT_TRGET_CN",
    "SLCTN_STDR_DC"
  ],
  officialOrigins: {
    source: ["https://www.bojo.go.kr", "https://www.data.go.kr"],
    apply: ["https://www.bojo.go.kr"]
  },
  fallbackSourceUrl: () => "https://www.data.go.kr/data/15156853/openapi.do",
  queryParams: (apiKey, pageSize, currentDate) => ({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: String(pageSize),
    resultType: "json",
    bsnsyear: String(koreaCalendarYear(currentDate))
  }),
  parsePayload: parseSubsidyPayload
};

abstract class PublicBenefitApiAdapter implements BenefitSourceAdapter {
  readonly sourceId: SourceId;
  readonly adapterVersion = ADAPTER_VERSION;

  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly pageSize: number;
  private readonly fetchImpl?: typeof globalThis.fetch;
  private readonly now: () => Date;
  private readonly logger: { warn: (message: string) => void };
  private readonly timeoutMs?: number;
  private readonly maxRetries?: number;
  private readonly retryDelayMs?: number;
  private readonly maxPayloadBytes?: number;
  private readonly linkStaleAfterDays: number;

  protected constructor(
    private readonly mapping: SourceMapping,
    options: PublicBenefitAdapterOptions = {}
  ) {
    this.sourceId = mapping.sourceId;
    this.apiKey = cleanKey(options.apiKey ?? process.env[mapping.envName]);
    this.endpoint = options.endpoint ?? mapping.defaultEndpoint;
    this.pageSize = options.pageSize ?? 100;
    this.fetchImpl = options.fetch;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.retryDelayMs = options.retryDelayMs;
    this.maxPayloadBytes = options.maxPayloadBytes;
    this.linkStaleAfterDays =
      options.linkStaleAfterDays ?? DEFAULT_LINK_STALE_AFTER_DAYS;
  }

  async search(options: AdapterSearchOptions = {}): Promise<AdapterResult> {
    let currentDate: Date;
    try {
      currentDate = safeNowDate(this.now);
    } catch {
      return this.failure(
        new Date(0).toISOString(),
        "unavailable",
        "invalid_configuration"
      );
    }
    const retrievedAt = currentDate.toISOString();

    if (!this.apiKey) {
      return this.failure(retrievedAt, "unavailable", "missing_configuration");
    }
    if (
      !Number.isSafeInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > this.mapping.maximumPageSize ||
      !Number.isSafeInteger(this.linkStaleAfterDays) ||
      this.linkStaleAfterDays < 1
    ) {
      return this.failure(retrievedAt, "unavailable", "invalid_configuration");
    }

    try {
      let endpoint: URL;
      try {
        endpoint = new URL(this.endpoint);
      } catch {
        throw new AdapterTransportError("invalid_configuration");
      }
      for (const [name, value] of Object.entries(
        this.mapping.queryParams(this.apiKey, this.pageSize, currentDate)
      )) {
        endpoint.searchParams.set(name, value);
      }

      const response = await fetchAdapterResource({
        endpoint,
        allowedOrigins: this.mapping.requestOrigins,
        allowedContentTypes: this.mapping.responseContentTypes,
        signal: options.signal,
        timeoutMs: this.timeoutMs,
        maxRetries: this.maxRetries,
        retryDelayMs: this.retryDelayMs,
        maxPayloadBytes: this.maxPayloadBytes,
        fetch: this.fetchImpl,
        now: () => currentDate,
        headers: {
          Accept: this.mapping.responseContentTypes.join(", ")
        }
      });

      const payload = this.mapping.parsePayload(response.body);
      const items = payload.items;
      const records = items
        .map((item) =>
          toBenefitRecord(
            item,
            this.mapping,
            response.retrievedAt,
            currentDate,
            this.linkStaleAfterDays
          )
        )
        .filter((record): record is BenefitRecord => record !== undefined);
      const rejectedCount = items.length - records.length;
      const pageTruncated = payload.totalCount > items.length;

      if (items.length > 0 && records.length === 0) {
        return this.failure(response.retrievedAt, "invalid_payload", "invalid_record");
      }

      const partialErrorCode =
        pageTruncated && rejectedCount > 0
          ? "page_truncated.invalid_record"
          : pageTruncated
            ? "page_truncated"
            : rejectedCount > 0
              ? "invalid_record"
              : undefined;

      return AdapterResultSchema.parse({
        records,
        observation: {
          sourceId: this.sourceId,
          status: partialErrorCode ? "partial" : "ok",
          retrievedAt: response.retrievedAt,
          recordCount: records.length,
          errorCode: partialErrorCode,
          adapterVersion: this.adapterVersion
        }
      });
    } catch (error) {
      if (error instanceof AdapterTransportError) {
        const status = transportObservationStatus(error.code);
        return this.failure(retrievedAt, status, error.code);
      }
      if (error instanceof UpstreamResponseError) {
        return this.failure(retrievedAt, "unavailable", "upstream_error");
      }
      return this.failure(retrievedAt, "invalid_payload", "invalid_payload");
    }
  }

  private failure(
    retrievedAt: string,
    status: SourceObservation["status"],
    errorCode: string
  ): AdapterResult {
    safeLoggerWarn(this.logger, `${this.sourceId}:${errorCode}`);
    return failedAdapterResult(
      this.sourceId,
      this.adapterVersion,
      retrievedAt,
      status,
      errorCode
    );
  }
}

export class YouthCenterRepository extends PublicBenefitApiAdapter {
  constructor(options: YouthCenterRepositoryOptions = {}) {
    super(YOUTH_CENTER_MAPPING, options);
  }
}

export class BokjiroRepository extends PublicBenefitApiAdapter {
  constructor(options: BokjiroRepositoryOptions = {}) {
    super(BOKJIRO_MAPPING, options);
  }
}

export class SubsidyRepository extends PublicBenefitApiAdapter {
  constructor(options: SubsidyRepositoryOptions = {}) {
    super(SUBSIDY_MAPPING, options);
  }
}

function parseYouthCenterPayload(body: string): ParsedSourcePayload {
  const root = parseJsonObject(body);
  const resultCode = textValue(root.resultCode);
  if (resultCode && !["0", "00", "200"].includes(resultCode)) {
    throw new UpstreamResponseError();
  }
  const result = objectValue(root.result);
  if (!result) throw new InvalidSourcePayloadError();
  const paging = objectValue(result.pagging ?? result.paging);
  const totalCount = requiredTotalCount(paging?.totCount ?? paging?.totalCount);
  const items = result?.youthPolicyList ?? result?.youthPlcyList;
  if (items === undefined || items === null) {
    if (totalCount === 0) return { items: [], totalCount };
    throw new InvalidSourcePayloadError();
  }
  return checkedSourcePayload(recordArray(items), totalCount);
}

function parseBokjiroPayload(body: string): ParsedSourcePayload {
  if (XMLValidator.validate(body) !== true) {
    throw new InvalidSourcePayloadError();
  }

  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: false,
      trimValues: true
    }).parse(body);
  } catch {
    throw new InvalidSourcePayloadError();
  }

  const root = objectValue(parsed);
  const wantedList = objectValue(root?.wantedList ?? objectValue(root?.response)?.wantedList);
  if (!wantedList) throw new InvalidSourcePayloadError();

  const resultCode = textValue(wantedList.resultCode);
  if (!resultCode) throw new InvalidSourcePayloadError();
  if (resultCode !== "0" && resultCode !== "00") {
    throw new UpstreamResponseError();
  }
  const totalCount = requiredTotalCount(wantedList.totalCount);
  if (wantedList.servList === undefined || wantedList.servList === null) {
    if (totalCount === 0) return { items: [], totalCount };
    throw new InvalidSourcePayloadError();
  }
  return checkedSourcePayload(recordArray(wantedList.servList), totalCount);
}

function parseSubsidyPayload(body: string): ParsedSourcePayload {
  const root = parseJsonObject(body);
  const response = objectValue(root.response) ?? root;
  const header = objectValue(response.header);
  const resultCode = textValue(header?.resultCode);
  if (!resultCode) throw new InvalidSourcePayloadError();
  if (resultCode !== "0" && resultCode !== "00") {
    throw new UpstreamResponseError();
  }
  const payloadBody = objectValue(response.body);
  if (!payloadBody) throw new InvalidSourcePayloadError();
  const totalCount = requiredTotalCount(payloadBody.totalCount);
  const items = objectValue(payloadBody.items)?.item;
  if (items === undefined || items === null) {
    if (totalCount === 0) return { items: [], totalCount };
    throw new InvalidSourcePayloadError();
  }
  return checkedSourcePayload(recordArray(items), totalCount);
}

function toBenefitRecord(
  item: SourceItem,
  mapping: SourceMapping,
  observedAt: string,
  currentDate: Date,
  linkStaleAfterDays: number
): BenefitRecord | undefined {
  const idHit = firstTextHit(item, mapping.idFields);
  const titleHit = firstTextHit(item, mapping.titleFields);
  if (!idHit || !titleHit) return undefined;

  const sourceRecordId = normalizedText(idHit.value, 256);
  const title = normalizedText(titleHit.value, DISPLAY_TEXT_LIMITS.title);
  if (!sourceRecordId || !title) return undefined;

  try {
    const contentHash = hashCanonicalJson(item);
    const providerHit = firstTextHit(item, mapping.providerFields);
    const summaryHit = firstTextHit(item, mapping.summaryFields);
    const targetHit = firstTextHit(item, mapping.targetFields);
    const provider = normalizedText(
      providerHit?.value ?? mapping.defaultProvider,
      DISPLAY_TEXT_LIMITS.provider
    );
    const summary = normalizedText(
      summaryHit?.value ?? title,
      DISPLAY_TEXT_LIMITS.summary
    );
    const target = normalizedText(
      targetHit?.value ?? "공식 출처에서 대상 조건을 확인하세요.",
      DISPLAY_TEXT_LIMITS.long
    );
    const eligibility = unique([
      ...normalizedList(item, mapping.eligibilityFields, DISPLAY_TEXT_LIMITS.long, 64),
      ...normalizedList(item, mapping.exclusionFields, DISPLAY_TEXT_LIMITS.long, 64).map(
        (value) => normalizedText(`제외/제한: ${value}`, DISPLAY_TEXT_LIMITS.long)
      )
    ]).slice(0, 64);
    const applicationPeriod = resolveApplicationPeriod(item, mapping);
    const applicationDeadline = resolveApplicationDeadline(item, mapping.applicationDeadlineFields);
    const recordId = opaqueRecordId(mapping.sourceId, sourceRecordId);
    const documents = normalizedList(item, mapping.documentFields, DISPLAY_TEXT_LIMITS.short, 128).map(
      (label, index) => ({
        id: `document-${index + 1}`,
        label,
        required: true,
        source: mapping.sourceId
      })
    );
    const applicationMethods = normalizedList(
      item,
      mapping.applicationMethodFields,
      DISPLAY_TEXT_LIMITS.short,
      32
    );
    const constraints = deriveRules(item, mapping);
    const stale = sourceLooksStale(
      item,
      mapping.staleDateFields,
      currentDate,
      linkStaleAfterDays
    );
    const linkResult = buildLinks(item, mapping, sourceRecordId, observedAt, stale);
    const category = deriveCategory(item, mapping);
    const searchableText = normalizedText(
      [title, summary, target, ...allTextHits(item, mapping.searchableFields).map((hit) => hit.value)]
        .join(" "),
      DISPLAY_TEXT_LIMITS.searchable
    );
    const provenance = buildProvenance({
      item,
      mapping,
      sourceRecordId,
      contentHash,
      observedAt,
      titleHit,
      providerHit,
      summaryHit,
      targetHit,
      constraints,
      linkFields: linkResult.sourceFields
    });

    return BenefitRecordSchema.parse({
      id: recordId,
      sourceId: mapping.sourceId,
      sourceRecordId,
      sourceRevision: mapping.sourceRevision,
      contentHash,
      title,
      provider,
      category,
      summary,
      target,
      eligibility,
      applicationPeriod,
      applicationDeadline,
      documents,
      applicationMethods,
      constraints,
      searchableText,
      provenance,
      links: linkResult.links,
      lastFetchedAt: observedAt
    });
  } catch {
    return undefined;
  }
}

function buildProvenance(input: {
  item: SourceItem;
  mapping: SourceMapping;
  sourceRecordId: string;
  contentHash: string;
  observedAt: string;
  titleHit: TextHit;
  providerHit?: TextHit;
  summaryHit?: TextHit;
  targetHit?: TextHit;
  constraints: BenefitRule[];
  linkFields: string[];
}): ProvenanceRecord[] {
  const rows: Array<{ field: string; sourceField: string; authority: EvidenceBasis }> = [
    { field: "/title", sourceField: input.titleHit.field, authority: "authoritative_structured" },
    {
      field: "/provider",
      sourceField: input.providerHit?.field ?? input.titleHit.field,
      authority: input.providerHit ? "authoritative_structured" : "default"
    },
    {
      field: "/summary",
      sourceField: input.summaryHit?.field ?? input.titleHit.field,
      authority: input.summaryHit ? "authoritative_structured" : "default"
    },
    {
      field: "/target",
      sourceField: input.targetHit?.field ?? input.titleHit.field,
      authority: input.targetHit ? "authoritative_structured" : "default"
    },
    { field: "/category", sourceField: input.titleHit.field, authority: "derived_text" },
    { field: "/searchableText", sourceField: input.titleHit.field, authority: "derived_text" }
  ];

  const mappedFields: Array<{
    pointer: string;
    fields: string[];
    authority: EvidenceBasis;
  }> = [
    {
      pointer: "/eligibility",
      fields: [...input.mapping.eligibilityFields, ...input.mapping.exclusionFields],
      authority: "authoritative_structured"
    },
    {
      pointer: "/applicationPeriod",
      fields: [
        ...input.mapping.applicationPeriodFields,
        ...input.mapping.applicationPeriodStartFields,
        ...input.mapping.applicationPeriodEndFields
      ],
      authority: "authoritative_structured"
    },
    {
      pointer: "/applicationDeadline",
      fields: input.mapping.applicationDeadlineFields,
      authority: "authoritative_structured"
    },
    {
      pointer: "/documents",
      fields: input.mapping.documentFields,
      authority: "authoritative_structured"
    },
    {
      pointer: "/applicationMethods",
      fields: input.mapping.applicationMethodFields,
      authority: "authoritative_structured"
    }
  ];
  for (const mappedField of mappedFields) {
    const hit = firstTextHit(input.item, mappedField.fields);
    if (hit) {
      rows.push({
        field: mappedField.pointer,
        sourceField: hit.field,
        authority: mappedField.authority
      });
    }
  }

  for (const [index, constraint] of input.constraints.entries()) {
    rows.push({
      field: `/constraints/${index}`,
      sourceField: constraint.sourceFields[0] ?? input.titleHit.field,
      authority: constraint.basis
    });
  }
  for (const [index, sourceField] of input.linkFields.entries()) {
    rows.push({
      field: `/links/${index}`,
      sourceField,
      authority: "authoritative_structured"
    });
  }

  return rows.map((row) => ({
    field: row.field,
    sourceId: input.mapping.sourceId,
    sourceRecordId: input.sourceRecordId,
    authority: row.authority,
    contentHash: input.contentHash,
    observedAt: input.observedAt,
    sourceRevision: input.mapping.sourceRevision,
    license: input.mapping.license,
    attribution: input.mapping.attribution
  }));
}

function buildLinks(
  item: SourceItem,
  mapping: SourceMapping,
  sourceRecordId: string,
  observedAt: string,
  stale: boolean
): { links: VerifiedLink[]; sourceFields: string[] } {
  const candidates: Array<{ rel: LinkRelation; hit: TextHit }> = [
    ...allTextHits(item, mapping.sourceLinkFields).map((hit) => ({ rel: "source" as const, hit })),
    ...allTextHits(item, mapping.applyLinkFields).map((hit) => ({ rel: "apply" as const, hit }))
  ];
  if (!candidates.some((candidate) => candidate.rel === "source")) {
    candidates.push({
      rel: "source",
      hit: { field: mapping.idFields[0] ?? "id", value: mapping.fallbackSourceUrl(sourceRecordId) }
    });
  }

  const links: VerifiedLink[] = [];
  const sourceFields: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const link = verifiedLink(candidate.rel, candidate.hit.value, mapping, observedAt, stale);
    if (!link) continue;
    const key = `${link.rel}:${link.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
    sourceFields.push(candidate.hit.field);
    if (links.length === 16) break;
  }

  if (!links.some((link) => link.rel === "source" && link.official)) {
    const fallback = verifiedLink(
      "source",
      mapping.fallbackSourceUrl(sourceRecordId),
      mapping,
      observedAt,
      stale
    );
    if (fallback && !seen.has(`${fallback.rel}:${fallback.url}`) && links.length < 16) {
      links.push(fallback);
      sourceFields.push(mapping.idFields[0] ?? "id");
    }
  }
  return { links, sourceFields };
}

function verifiedLink(
  rel: LinkRelation,
  rawUrl: string,
  mapping: SourceMapping,
  observedAt: string,
  stale: boolean
): VerifiedLink | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !isPublicLinkHostname(url.hostname) ||
    hasSensitiveQueryParameter(url)
  ) {
    return undefined;
  }
  url.hash = "";

  const official =
    url.protocol === "https:" && mapping.officialOrigins[rel].includes(url.origin);
  if (official) {
    return {
      rel,
      url: url.toString(),
      official: true,
      health: stale ? "stale" : "verified",
      verifiedAt: observedAt,
      verificationMethod: "exact_origin_registry"
    };
  }
  return {
    rel,
    url: url.toString(),
    official: false,
    health: url.protocol === "http:" ? "unreachable" : "unchecked",
    verificationMethod:
      url.protocol === "http:" ? "insecure_scheme" : "unregistered_origin"
  };
}

function deriveRules(item: SourceItem, mapping: SourceMapping): BenefitRule[] {
  const rules: BenefitRule[] = [];
  const structuredRegionHits = allTextHits(item, mapping.structuredRegionFields);
  const structuredRegions = regionCodesFromStructured(
    structuredRegionHits.map((hit) => hit.value).join(" ")
  );
  if (structuredRegions.length > 0) {
    rules.push({
      dimension: "region",
      allowedValues: structuredRegions,
      operator: "in",
      basis: "authoritative_structured",
      ruleId: `${mapping.sourceId}.region.structured`,
      ruleVersion: mapping.sourceRevision,
      sourceFields: unique(structuredRegionHits.map((hit) => hit.field)),
      explanation: "공식 구조화 지역 필드에서 확인한 대상 지역입니다."
    });
  }

  const minimumAgeHit = firstTextHit(item, mapping.structuredAgeMinFields);
  const maximumAgeHit = firstTextHit(item, mapping.structuredAgeMaxFields);
  const minimumAge = Number(minimumAgeHit?.value);
  const maximumAge = Number(maximumAgeHit?.value);
  const structuredAges =
    minimumAgeHit && maximumAgeHit && Number.isFinite(minimumAge) && Number.isFinite(maximumAge)
      ? ageBandsForRange(minimumAge, maximumAge)
      : [];
  if (structuredAges.length > 0) {
    rules.push({
      dimension: "age",
      allowedValues: structuredAges,
      operator: "in",
      basis: "authoritative_structured",
      ruleId: `${mapping.sourceId}.age.structured`,
      ruleVersion: mapping.sourceRevision,
      sourceFields: unique([minimumAgeHit!.field, maximumAgeHit!.field]),
      explanation: "공식 구조화 최소·최대 연령 필드에서 계산한 나이대입니다."
    });
  }

  const derivedHits = allTextHits(item, mapping.derivedConstraintFields);
  const derivedText = derivedHits.map((hit) => hit.value).join(" ");
  const derivedFields = unique(derivedHits.map((hit) => hit.field));

  if (structuredRegions.length === 0) {
    const values = regionCodes(derivedText);
    if (values.length > 0) {
      rules.push(derivedRule(mapping, "region", values, derivedFields, "텍스트에서 찾은 지역 신호입니다."));
    }
  }
  if (structuredAges.length === 0) {
    const values = ageBandsFromText(derivedText);
    if (values.length > 0) {
      rules.push(derivedRule(mapping, "age", values, derivedFields, "텍스트에서 찾은 연령 신호입니다."));
    }
  }

  const studentValues = derivedText.includes("대학생") || derivedText.includes("재학생") || derivedText.includes("학생")
    ? (["student"] as const)
    : [];
  if (studentValues.length > 0) {
    rules.push(derivedRule(mapping, "student", [...studentValues], derivedFields, "텍스트에서 찾은 학생 신호입니다."));
  }

  const employmentValues: Array<"employed" | "self_employed" | "unemployed"> = [];
  if (/미취업|구직|실업|실직/u.test(derivedText)) employmentValues.push("unemployed");
  if (/재직|근로|취업자|직장/u.test(derivedText)) employmentValues.push("employed");
  if (/창업|자영|소상공/u.test(derivedText)) employmentValues.push("self_employed");
  if (employmentValues.length > 0) {
    rules.push(
      derivedRule(
        mapping,
        "employment",
        unique(employmentValues),
        derivedFields,
        "텍스트에서 찾은 고용 상태 신호입니다."
      )
    );
  }

  const householdValues: Array<"single" | "couple" | "family" | "single_parent"> = [];
  if (/1인|단독/u.test(derivedText)) householdValues.push("single");
  if (/부부|신혼/u.test(derivedText)) householdValues.push("couple");
  if (/가족|아동|양육/u.test(derivedText)) householdValues.push("family");
  if (/한부모/u.test(derivedText)) householdValues.push("single_parent");
  if (householdValues.length > 0) {
    rules.push(
      derivedRule(
        mapping,
        "household",
        unique(householdValues),
        derivedFields,
        "텍스트에서 찾은 가구 유형 신호입니다."
      )
    );
  }

  return rules.slice(0, 32);
}

function derivedRule(
  mapping: SourceMapping,
  dimension: BenefitRule["dimension"],
  allowedValues: string[],
  sourceFields: string[],
  explanation: string
): BenefitRule {
  return {
    dimension,
    allowedValues,
    operator: "in",
    basis: "derived_text",
    ruleId: `${mapping.sourceId}.${dimension}.derived`,
    ruleVersion: mapping.sourceRevision,
    sourceFields,
    explanation
  } as BenefitRule;
}

const REGION_CODES: Array<[RegionCode, string[]]> = [
  ["KR-11", ["서울"]],
  ["KR-26", ["부산"]],
  ["KR-27", ["대구"]],
  ["KR-28", ["인천"]],
  ["KR-29", ["광주"]],
  ["KR-30", ["대전"]],
  ["KR-31", ["울산"]],
  ["KR-36", ["세종"]],
  ["KR-41", ["경기"]],
  ["KR-42", ["강원"]],
  ["KR-43", ["충북", "충청북도"]],
  ["KR-44", ["충남", "충청남도"]],
  ["KR-45", ["전북", "전라북도"]],
  ["KR-46", ["전남", "전라남도"]],
  ["KR-47", ["경북", "경상북도"]],
  ["KR-48", ["경남", "경상남도"]],
  ["KR-49", ["제주"]]
];

function regionCodes(text: string): RegionCode[] {
  return REGION_CODES.filter(([, names]) => names.some((name) => text.includes(name))).map(
    ([code]) => code
  );
}

const LEGAL_DISTRICT_PREFIX_TO_REGION: Record<string, RegionCode> = {
  "11": "KR-11",
  "12": "KR-29",
  "26": "KR-26",
  "27": "KR-27",
  "28": "KR-28",
  "29": "KR-29",
  "30": "KR-30",
  "31": "KR-31",
  "36": "KR-36",
  "41": "KR-41",
  "42": "KR-42",
  "43": "KR-43",
  "44": "KR-44",
  "45": "KR-45",
  "46": "KR-46",
  "47": "KR-47",
  "48": "KR-48",
  "49": "KR-49",
  "50": "KR-49",
  "51": "KR-42",
  "52": "KR-45"
};

function regionCodesFromStructured(text: string): RegionCode[] {
  const fromNames = regionCodes(text);
  const fromLegalDistrictCodes = [...text.matchAll(/(?:^|\D)(\d{5})(?=\D|$)/gu)]
    .map((match) => LEGAL_DISTRICT_PREFIX_TO_REGION[match[1]!.slice(0, 2)])
    .filter((code): code is RegionCode => code !== undefined);
  return unique([...fromNames, ...fromLegalDistrictCodes]);
}

function ageBandsForRange(minimum: number, maximum: number): AgeBand[] {
  if (minimum > maximum || minimum < 0 || maximum > 200) return [];
  const ranges: Array<[AgeBand, number, number]> = [
    ["teen", 13, 19],
    ["twenties", 20, 29],
    ["thirties", 30, 39],
    ["forties", 40, 49],
    ["fifties", 50, 59],
    ["sixties_plus", 60, 200]
  ];
  return ranges
    .filter(([band, start, end]) => {
      if (band === "teen" && minimum >= 19) return false;
      return minimum <= end && maximum >= start;
    })
    .map(([band]) => band);
}

function ageBandsFromText(text: string): AgeBand[] {
  const ages = new Set<AgeBand>();
  const decadeBands: Array<[string, AgeBand]> = [
    ["10대", "teen"],
    ["20대", "twenties"],
    ["30대", "thirties"],
    ["40대", "forties"],
    ["50대", "fifties"],
    ["60대", "sixties_plus"]
  ];
  for (const [token, band] of decadeBands) {
    if (text.includes(token)) ages.add(band);
  }
  for (const match of text.matchAll(/(?:만\s*)?(\d{1,3})\s*세/gu)) {
    const age = Number(match[1]);
    const band = ageBandsForRange(age, age)[0];
    if (band) ages.add(band);
  }
  if (/노인|어르신|고령/u.test(text)) ages.add("sixties_plus");
  if (text.includes("청년")) {
    ages.add("twenties");
    ages.add("thirties");
  }
  return [...ages];
}

function deriveCategory(item: SourceItem, mapping: SourceMapping): BenefitCategory {
  const text = [
    ...allTextHits(item, mapping.titleFields),
    ...allTextHits(item, mapping.summaryFields),
    ...allTextHits(item, mapping.searchableFields)
  ]
    .map((hit) => hit.value)
    .join(" ");
  if (/취업|일자리|구직|창업/u.test(text)) return "employment";
  if (/주거|월세|임대/u.test(text)) return "housing";
  if (/교육|장학|훈련/u.test(text)) return "education";
  if (/건강|의료|돌봄/u.test(text)) return "health";
  if (/가족|출산|육아|양육|아동/u.test(text)) return "family";
  if (text.includes("청년")) return "youth";
  if (regionCodes(text).length > 0) return "local";
  return "other";
}

function resolveApplicationPeriod(
  item: SourceItem,
  mapping: SourceMapping
): string | undefined {
  const direct = firstTextHit(item, mapping.applicationPeriodFields);
  if (direct) return normalizedText(direct.value, DISPLAY_TEXT_LIMITS.short) || undefined;

  const start = firstTextHit(item, mapping.applicationPeriodStartFields);
  const end = firstTextHit(item, mapping.applicationPeriodEndFields);
  if (!start && !end) return undefined;
  return normalizedText(
    [start?.value, end?.value].filter(Boolean).join(" ~ "),
    DISPLAY_TEXT_LIMITS.short
  ) || undefined;
}

function resolveApplicationDeadline(
  item: SourceItem,
  fields: string[]
): string | undefined {
  const raw = firstTextHit(item, fields)?.value;
  if (!raw) return undefined;
  const dates = dateTokens(raw);
  const last = dates.at(-1);
  if (!last) return undefined;
  try {
    return kstDeadlineToUtc(last);
  } catch {
    return undefined;
  }
}

function sourceLooksStale(
  item: SourceItem,
  fields: string[],
  currentDate: Date,
  staleAfterDays: number
): boolean {
  const raw = firstTextHit(item, fields)?.value;
  if (!raw) return false;
  const date = parseSourceDate(raw);
  if (!date) return false;
  return currentDate.getTime() - date.getTime() > staleAfterDays * 24 * 60 * 60 * 1_000;
}

function parseSourceDate(raw: string): Date | undefined {
  const token = dateTokens(raw)[0];
  if (!token) return undefined;
  const date = new Date(`${token}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function koreaCalendarYear(date: Date): number {
  return new Date(date.getTime() + 9 * 60 * 60 * 1_000).getUTCFullYear();
}

function dateTokens(raw: string): string[] {
  const compact = [...raw.matchAll(/\b(\d{4})(\d{2})(\d{2})\b/gu)].map(
    (match) => `${match[1]}-${match[2]}-${match[3]}`
  );
  const separated = [
    ...raw.matchAll(/\b(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/gu)
  ].map(
    (match) =>
      `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
  );
  return [...compact, ...separated];
}

function opaqueRecordId(sourceId: SourceId, sourceRecordId: string): string {
  const candidate = `${sourceId}:${sourceRecordId}`;
  if (OPAQUE_ID_PATTERN.test(candidate)) return candidate;
  return `${sourceId}:${sha256Hex(sourceRecordId).slice(0, 32)}`;
}

function dedupeRecords(records: BenefitRecord[]): BenefitRecord[] {
  const deduped = new Map<string, BenefitRecord>();
  for (const record of records) {
    const key = record.id;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, record);
      continue;
    }
    const merged = BenefitRecordSchema.safeParse({
      ...existing,
      constraints: uniqueObjects([...existing.constraints, ...record.constraints]).slice(0, 32),
      provenance: uniqueObjects([...existing.provenance, ...record.provenance]).slice(0, 256),
      links: uniqueObjects([...existing.links, ...record.links]).slice(0, 16)
    });
    if (merged.success) deduped.set(key, merged.data);
  }
  return [...deduped.values()];
}

function uniqueObjects<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function failedAdapterResult(
  sourceId: string,
  adapterVersion: string,
  retrievedAt: string,
  status: SourceObservation["status"],
  errorCode: string
): AdapterResult {
  return AdapterResultSchema.parse({
    records: [],
    observation: {
      sourceId,
      status,
      retrievedAt,
      recordCount: 0,
      errorCode,
      adapterVersion
    }
  });
}

function transportObservationStatus(
  code: AdapterTransportErrorCode
): SourceObservation["status"] {
  if (code === "timeout") return "timeout";
  if (code === "invalid_content_type" || code === "payload_too_large") {
    return "invalid_payload";
  }
  return "unavailable";
}

function parseJsonObject(body: string): SourceItem {
  try {
    const value = JSON.parse(body) as unknown;
    const record = objectValue(value);
    if (!record) throw new InvalidSourcePayloadError();
    return record;
  } catch (error) {
    if (error instanceof InvalidSourcePayloadError) throw error;
    throw new InvalidSourcePayloadError();
  }
}

function recordArray(value: unknown): SourceItem[] {
  if (Array.isArray(value)) {
    if (value.some((entry) => !isRecord(entry))) {
      throw new InvalidSourcePayloadError();
    }
    return value;
  }
  if (isRecord(value)) return [value];
  throw new InvalidSourcePayloadError();
}

function requiredTotalCount(value: unknown): number {
  const raw = textValue(value);
  if (!raw || !/^\d+$/u.test(raw)) throw new InvalidSourcePayloadError();
  const totalCount = Number(raw);
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new InvalidSourcePayloadError();
  }
  return totalCount;
}

function checkedSourcePayload(
  items: SourceItem[],
  totalCount: number
): ParsedSourcePayload {
  if (items.length > totalCount || (totalCount > 0 && items.length === 0)) {
    throw new InvalidSourcePayloadError();
  }
  return { items, totalCount };
}

function objectValue(value: unknown): SourceItem | undefined {
  return isRecord(value) ? value : undefined;
}

function firstTextHit(item: SourceItem, fields: string[]): TextHit | undefined {
  for (const field of fields) {
    const value = textValue(item[field]);
    if (value) return { field, value };
  }
  return undefined;
}

function allTextHits(item: SourceItem, fields: string[]): TextHit[] {
  return fields.flatMap((field) => {
    const value = textValue(item[field]);
    return value ? [{ field, value }] : [];
  });
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizedList(
  item: SourceItem,
  fields: string[],
  maximumLength: number,
  maximumItems: number
): string[] {
  const values = allTextHits(item, fields).flatMap((hit) => splitList(hit.value));
  return unique(
    values
      .map((value) => normalizedText(value, maximumLength))
      .filter(Boolean)
  ).slice(0, maximumItems);
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n·ㆍ]|<br\s*\/?\s*>/giu)
    .map((entry) => entry.replace(/^[-*]\s*/u, "").trim())
    .filter(Boolean);
}

function normalizedText(value: string, maximumLength: number): string {
  return normalizeDisplayText(value, maximumLength);
}

function cleanKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function safeNowDate(now: () => Date): Date {
  try {
    const value = now();
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  } catch {
    // Stable configuration error is represented by the calling adapter.
  }
  throw new AdapterTransportError("invalid_configuration");
}

function safeNowIso(now: () => Date): string {
  try {
    return safeNowDate(now).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function isValidSourceAdapter(value: unknown): value is BenefitSourceAdapter {
  if (!value || typeof value !== "object") return false;
  try {
    const adapter = value as BenefitSourceAdapter;
    return (
      typeof adapter.sourceId === "string" &&
      OPAQUE_ID_PATTERN.test(adapter.sourceId) &&
      VersionStringSchema.safeParse(adapter.adapterVersion).success &&
      typeof adapter.search === "function"
    );
  } catch {
    return false;
  }
}

function safeWarn(warn: ((message: string) => void) | undefined, message: string): void {
  try {
    warn?.(message);
  } catch {
    // Diagnostics must never replace the stable adapter result.
  }
}

function safeLoggerWarn(logger: { warn: (message: string) => void }, message: string): void {
  try {
    logger.warn(message);
  } catch {
    // Diagnostics must never replace the stable adapter result.
  }
}

const SENSITIVE_QUERY_PARAMETER_NAMES = new Set([
  "apikey",
  "servicekey",
  "accesskey",
  "accesstoken",
  "token",
  "authorization",
  "password",
  "credential",
  "secret",
  "clientsecret"
]);

function hasSensitiveQueryParameter(url: URL): boolean {
  return [...url.searchParams.keys()].some((name) =>
    SENSITIVE_QUERY_PARAMETER_NAMES.has(name.replace(/[^A-Za-z0-9]/gu, "").toLowerCase())
  );
}

function isPublicLinkHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".home.arpa")
  ) {
    return false;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return isPublicIpv4(hostname);
  if (ipVersion === 6) return /^[23]/u.test(hostname);
  return true;
}

function isPublicIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false;
  const [first, second] = octets as [number, number, number, number];
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is SourceItem {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class InvalidSourcePayloadError extends Error {}
class UpstreamResponseError extends Error {}
