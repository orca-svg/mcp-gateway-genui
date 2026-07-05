import { kstDeadlineToUtc, type BenefitRepository } from "@mcp-gen-ui/core";
import {
  BenefitRecordSchema,
  type AgeRange,
  type BenefitCategory,
  type BenefitRecord,
  type EmploymentStatus,
  type HouseholdType
} from "@mcp-gen-ui/schema";

export interface CompositeBenefitRepositoryOptions {
  warn?: (message: string) => void;
}

export class CompositeBenefitRepository implements BenefitRepository {
  constructor(
    private readonly repositories: BenefitRepository[],
    private readonly options: CompositeBenefitRepositoryOptions = {}
  ) {}

  async search(): Promise<BenefitRecord[]> {
    const deduped = new Map<string, BenefitRecord>();
    for (const repository of this.repositories) {
      try {
        for (const record of await repository.search()) {
          const key = dedupeKey(record);
          if (!deduped.has(key)) deduped.set(key, record);
        }
      } catch (error) {
        this.options.warn?.(`Benefit repository failed during search: ${messageFrom(error)}`);
      }
    }
    return [...deduped.values()];
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    for (const record of await this.search()) {
      if (record.id === id) return record;
    }
    return undefined;
  }
}

export interface CachingBenefitRepositoryOptions {
  ttlMs: number;
  now?: () => number;
}

export class CachingBenefitRepository implements BenefitRepository {
  private searchCache?: { expiresAt: number; records: BenefitRecord[] };
  private readonly now: () => number;

  constructor(
    private readonly repository: BenefitRepository,
    private readonly options: CachingBenefitRepositoryOptions
  ) {
    this.now = options.now ?? Date.now;
  }

  async search(): Promise<BenefitRecord[]> {
    const current = this.now();
    if (this.searchCache && this.searchCache.expiresAt > current) {
      return this.searchCache.records;
    }

    const records = await this.repository.search();
    this.searchCache = { records, expiresAt: current + this.options.ttlMs };
    return records;
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    return (await this.search()).find((record) => record.id === id);
  }
}

interface PublicBenefitRepositoryOptions {
  apiKey?: string;
  endpoint?: string;
  pageSize?: number;
  fetch?: typeof fetch;
  now?: () => Date;
  logger?: { warn: (message: string) => void };
}

export interface YouthCenterRepositoryOptions extends PublicBenefitRepositoryOptions {}
export interface BokjiroRepositoryOptions extends PublicBenefitRepositoryOptions {}
export interface SubsidyRepositoryOptions extends PublicBenefitRepositoryOptions {}

type SourceItem = Record<string, unknown>;

type AdapterSource = "youth-center" | "bokjiro" | "subsidy24";

interface AdapterConfig {
  source: AdapterSource;
  envName: string;
  defaultEndpoint: string;
  sourceLabel: string;
  defaultProvider: string;
  queryParams: (apiKey: string, pageSize: number) => Record<string, string>;
}

const YOUTH_CENTER_CONFIG: AdapterConfig = {
  source: "youth-center",
  envName: "YOUTH_CENTER_API_KEY",
  defaultEndpoint: "https://apis.data.go.kr/1051000/youthPlcyList/getYouthPlcyList",
  sourceLabel: "YouthCenter",
  defaultProvider: "한국고용정보원",
  queryParams: (apiKey, pageSize) => ({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: String(pageSize),
    type: "json"
  })
};

const BOKJIRO_CONFIG: AdapterConfig = {
  source: "bokjiro",
  envName: "BOKJIRO_API_KEY",
  defaultEndpoint: "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001",
  sourceLabel: "Bokjiro",
  defaultProvider: "한국사회보장정보원",
  queryParams: (apiKey, pageSize) => ({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: String(pageSize),
    resultType: "json"
  })
};

const SUBSIDY_CONFIG: AdapterConfig = {
  source: "subsidy24",
  envName: "SUBSIDY24_API_KEY",
  defaultEndpoint: "https://apis.data.go.kr/1051000/MoefOpenAPI/T_OPD_PBNS",
  sourceLabel: "Subsidy24",
  defaultProvider: "기획재정부",
  queryParams: (apiKey, pageSize) => ({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: String(pageSize),
    resultType: "json",
  })
};

abstract class PublicBenefitApiRepository implements BenefitRepository {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly pageSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly logger: { warn: (message: string) => void };

  protected constructor(
    private readonly config: AdapterConfig,
    options: PublicBenefitRepositoryOptions = {}
  ) {
    this.apiKey = options.apiKey ?? process.env[config.envName];
    this.endpoint = options.endpoint ?? config.defaultEndpoint;
    this.pageSize = options.pageSize ?? 100;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
  }

  async search(): Promise<BenefitRecord[]> {
    if (!this.apiKey) {
      this.logger.warn(`${this.config.envName} is not configured; returning no ${this.config.sourceLabel} benefits.`);
      return [];
    }

    try {
      const url = new URL(this.endpoint);
      for (const [key, value] of Object.entries(this.config.queryParams(this.apiKey, this.pageSize))) {
        url.searchParams.set(key, value);
      }

      const response = await this.fetchImpl(url);
      if (!response.ok) {
        this.logger.warn(`${this.config.sourceLabel} API request failed with HTTP ${response.status}.`);
        return [];
      }

      const payload = (await response.json()) as unknown;
      return extractBenefitItems(payload)
        .map((item) => this.toBenefitRecord(item))
        .filter((record): record is BenefitRecord => record !== undefined);
    } catch (error) {
      this.logger.warn(`${this.config.sourceLabel} API request failed: ${messageFrom(error)}`);
      return [];
    }
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    return (await this.search()).find((record) => record.id === id);
  }

  private toBenefitRecord(item: SourceItem): BenefitRecord | undefined {
    const sourceId = firstText(item, [
      "plcyNo",
      "policyNo",
      "bizId",
      "id",
      "servId",
      "serviceId",
      "svcId",
      "wlfareInfoId",
      "bizSeCd",
      "PBANC_ID",
      "PBANC_NO",
      "PBANC_SN",
      "BIZ_ID",
      "BSNS_ID",
      "ASST_BSNS_ID",
      "DTL_BSNS_ID"
    ]);
    const title = firstText(item, [
      "plcyNm",
      "policyName",
      "title",
      "servNm",
      "serviceName",
      "svcNm",
      "wlfareInfoNm",
      "serviceNm",
      "jrsdDptAlltNm",
      "PBANC_NM",
      "PBNS_NM",
      "BSNS_NM",
      "ASST_BSNS_NM",
      "DTL_BSNS_NM",
      "BIZ_NM"
    ]);
    if (!sourceId || !title) return undefined;

    const provider =
      firstText(item, [
        "sprvsnInstCdNm",
        "operInstCdNm",
        "provider",
        "insttNm",
        "jurMnofNm",
        "jrsdDptNm",
        "inqOrgNm",
        "orgNm",
        "serviceProvider",
        "PBANC_INST_NM",
        "PBNS_INST_NM",
        "PBANC_ORG_NM",
        "MNG_INST_NM",
        "JURISD_INST_NM",
        "INST_NM",
        "MINISTRY_NM"
      ]) ?? this.config.defaultProvider;
    const summary = firstText(item, [
      "plcyExplnCn",
      "sprtCn",
      "summary",
      "plcyCn",
      "servDgst",
      "svcPpo",
      "servicePurpose",
      "wlfareInfoReldCn",
      "BSNS_PURPS",
      "BIZ_PURPS",
      "PBANC_CN",
      "PBNS_CN",
      "SUP_CN",
      "SPRT_CN",
      "BSNS_CN"
    ]) ?? title;
    const target = firstText(item, [
      "sprtTrgtCn",
      "target",
      "ageInfo",
      "earnEtcCn",
      "trgterIndvdl",
      "slctCritCn",
      "supportTarget",
      "svcPpo",
      "SPRT_TRGT_CN",
      "SUP_TRGT_CN",
      "TRGT_CN",
      "APLY_TRGT_CN",
      "REQST_QUALF_CN",
      "SLCT_CRTR_CN"
    ]) ?? "공공서비스 대상자";
    const sourceUrl = normalizeUrl(
      firstText(item, [
        "refUrlAddr1",
        "refUrlAddr2",
        "sourceUrl",
        "plcyUrlAddr",
        "servDtlLink",
        "serviceUrl",
        "dtlUrl",
        "onlineUrl",
        "PBANC_URL",
        "PBNS_URL",
        "DTL_URL",
        "HMPG_URL",
        "URL"
      ]),
      fallbackSourceUrl(this.config.source, sourceId)
    );
    const applicationUrl = normalizeUrl(firstText(item, [
      "aplyUrlAddr",
      "applicationUrl",
      "onlineUrl",
      "svcUrl",
      "servDtlLink",
      "REQST_URL",
      "APLY_URL",
      "PBANC_URL",
      "PBNS_URL"
    ]));

    const parsed = BenefitRecordSchema.safeParse({
      id: `${this.config.source}:${sourceId}`,
      title,
      provider,
      category: deriveCategory(item),
      summary,
      target,
      eligibility: splitList(firstText(item, [
        "sprtTrgtCn",
        "earnEtcCn",
        "ageInfo",
        "trgterIndvdl",
        "slctCritCn",
        "supportTarget",
        "SPRT_TRGT_CN",
        "SUP_TRGT_CN",
        "TRGT_CN",
        "APLY_TRGT_CN",
        "REQST_QUALF_CN",
        "SLCT_CRTR_CN"
      ])),
      applicationPeriod: firstText(item, [
        "aplyYmd",
        "aplyPrd",
        "applicationPeriod",
        "reqstBeginEndDe",
        "svcAvailPrd",
        "applicationDueDate",
        "REQST_PD",
        "REQST_PERIOD",
        "RCEPT_PD",
        "RCEPT_PERIOD",
        "PBANC_PD",
        "PBNS_PD",
        "PBANC_BEGIN_DE",
        "PBANC_END_DE",
        "RCEPT_BEGIN_DE",
        "RCEPT_END_DE"
      ]),
      applicationDeadline: deriveApplicationDeadline(item),
      documents: splitList(firstText(item, ["sbmsnDcmntCn", "documents", "requiredDocuments", " 구비서류", "pprsUpdtCn", "SBMSN_DCMNT_CN", "REQST_DCMNT_CN", "PPRS_CN"])).map((label, index) => ({
        id: `document-${index + 1}`,
        label,
        required: true,
        source: this.config.source
      })),
      applicationMethods: splitList(firstText(item, ["aplyMthdCn", "applicationMethods", "reqstMthPapers", "serviceUseMethod", "svcUseMthd", "REQST_MTH_CN", "APLY_MTHD_CN", "REQST_MTH", "APLY_MTHD"])),
      applicationUrl,
      sourceUrl,
      lastFetchedAt: this.now().toISOString(),
      evidence: [],
      searchableText: [summary, target, firstText(item, ["plcyKywdNm", "keywords", "svcPpo", "servDgst", "PBANC_NM", "BSNS_NM", "ASST_BSNS_NM"]), provider]
        .filter(Boolean)
        .join(" "),
      regionTags: deriveRegions(item),
      ageRanges: deriveAgeRanges(item),
      householdTypes: deriveHouseholdTypes(item),
      studentOnly: containsAny(item, ["대학생", "재학생", "학생", "장학"]),
      employmentStatuses: deriveEmploymentStatuses(item)
    });

    if (!parsed.success) {
      this.logger.warn(`${this.config.sourceLabel} policy ${sourceId} did not match BenefitRecordSchema.`);
      return undefined;
    }
    return parsed.data;
  }
}

export class YouthCenterRepository extends PublicBenefitApiRepository {
  constructor(options: YouthCenterRepositoryOptions = {}) {
    super(YOUTH_CENTER_CONFIG, options);
  }
}

export class BokjiroRepository extends PublicBenefitApiRepository {
  constructor(options: BokjiroRepositoryOptions = {}) {
    super(BOKJIRO_CONFIG, options);
  }
}

export class SubsidyRepository extends PublicBenefitApiRepository {
  constructor(options: SubsidyRepositoryOptions = {}) {
    super(SUBSIDY_CONFIG, options);
  }
}

function dedupeKey(record: BenefitRecord): string {
  return `${record.sourceUrl || "no-source"}::${record.id}`.split("::")[0] || record.id;
}

function extractBenefitItems(payload: unknown): SourceItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const directKeys = [
    "youthPolicyList",
    "youthPlcyList",
    "servList",
    "serviceList",
    "wlfareInfoList",
    "subsidyList",
    "items",
    "item",
    "data",
    "list"
  ];

  const stack: unknown[] = [root.result, root.response, root.body, root];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const candidate = stack.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      const records = candidate.filter(isRecord);
      if (records.length > 0) return records;
      continue;
    }

    const record = candidate as Record<string, unknown>;
    for (const key of directKeys) {
      const value = record[key];
      if (Array.isArray(value)) return value.filter(isRecord);
      if (isRecord(value)) {
        const nested = directKeys.map((nestedKey) => value[nestedKey]).find((nestedValue) => Array.isArray(nestedValue));
        if (Array.isArray(nested)) return nested.filter(isRecord);
        stack.push(value);
      }
    }

    stack.push(...Object.values(record).filter((value) => value && typeof value === "object"));
  }

  return [];
}

function firstText(item: SourceItem, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n·ㆍ]|<br\s*\/?\s*>/i)
    .map((entry) => entry.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function normalizeUrl(value: string | undefined, fallback?: string): string | undefined {
  const candidate = value?.startsWith("http") ? value : fallback;
  if (!candidate) return undefined;
  try {
    return new URL(candidate).toString();
  } catch {
    return fallback;
  }
}

function fallbackSourceUrl(source: AdapterSource, id: string): string {
  if (source === "youth-center") {
    return `https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifDtl.do?bizId=${encodeURIComponent(id)}`;
  }
  if (source === "bokjiro") {
    return `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${encodeURIComponent(id)}`;
  }
  return `https://www.data.go.kr/data/15156853/openapi.do#${encodeURIComponent(id)}`;
}

function deriveRegions(item: SourceItem): string[] {
  const text = joinedText(item, [
    "zipCd",
    "region",
    "rgonNm",
    "sprvsnInstCdNm",
    "plcyExplnCn",
    "servDgst",
    "svcPpo",
    "jurMnofNm",
    "jrsdDptNm",
    "addr",
    "localArea",
    "PBANC_INST_NM",
    "PBNS_INST_NM",
    "PBANC_ORG_NM",
    "MNG_INST_NM",
    "JURISD_INST_NM",
    "INST_NM",
    "BSNS_PURPS",
    "PBANC_CN",
    "PBNS_CN",
    "SUP_CN",
    "SPRT_CN"
  ]);
  const regions = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  return regions.filter((region) => text.includes(region));
}

function deriveAgeRanges(item: SourceItem): AgeRange[] {
  const min = Number(firstText(item, ["sprtTrgtMinAge", "minAge", "ageMin", "trgterAgeBegin"]));
  const max = Number(firstText(item, ["sprtTrgtMaxAge", "maxAge", "ageMax", "trgterAgeEnd"]));
  const ranges: Array<[AgeRange, number, number]> = [
    ["teen", 13, 19],
    ["twenties", 20, 29],
    ["thirties", 30, 39],
    ["forties", 40, 49],
    ["fifties", 50, 59],
    ["sixties_plus", 60, 200]
  ];
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return ranges
      .filter(([range, start, end]) => {
        if (range === "teen" && min >= 19) return false;
        return min <= end && max >= start;
      })
      .map(([range]) => range);
  }
  const text = joinedText(item, ["ageInfo", "sprtTrgtCn", "plcyExplnCn", "trgterIndvdl", "slctCritCn", "servDgst", "svcPpo", "SPRT_TRGT_CN", "SUP_TRGT_CN", "TRGT_CN", "APLY_TRGT_CN", "REQST_QUALF_CN", "SLCT_CRTR_CN", "BSNS_PURPS", "PBANC_CN", "PBNS_CN", "SUP_CN", "SPRT_CN"]);
  const ages = new Set<AgeRange>();
  for (const [range, start] of ranges) {
    if (text.includes(`${Math.floor(start / 10) * 10}대`)) ages.add(range);
  }
  for (const match of text.matchAll(/(?:만\s*)?(\d{1,3})\s*세/g)) {
    const age = Number(match[1]);
    const range = ranges.find(([, start, end]) => age >= start && age <= end)?.[0];
    if (range && !(range === "teen" && age >= 19)) ages.add(range);
  }
  if (text.includes("노인") || text.includes("어르신") || text.includes("고령")) ages.add("sixties_plus");
  if (text.includes("청년")) {
    ages.add("twenties");
    ages.add("thirties");
  }
  return [...ages];
}

function deriveHouseholdTypes(item: SourceItem): HouseholdType[] {
  const text = joinedText(item, ["earnEtcCn", "sprtTrgtCn", "plcyExplnCn", "trgterIndvdl", "slctCritCn", "supportTarget", "servDgst", "svcPpo", "SPRT_TRGT_CN", "SUP_TRGT_CN", "TRGT_CN", "APLY_TRGT_CN", "REQST_QUALF_CN", "SLCT_CRTR_CN", "BSNS_PURPS", "PBANC_CN", "PBNS_CN", "SUP_CN", "SPRT_CN"]);
  const types: HouseholdType[] = [];
  if (text.includes("1인") || text.includes("단독")) types.push("single");
  if (text.includes("부부") || text.includes("신혼")) types.push("couple");
  if (text.includes("가족") || text.includes("가구") || text.includes("아동") || text.includes("양육")) types.push("family");
  if (text.includes("한부모")) types.push("single_parent");
  return [...new Set(types)];
}

function deriveEmploymentStatuses(item: SourceItem): EmploymentStatus[] {
  const text = joinedText(item, ["plcyKywdNm", "sprtTrgtCn", "plcyExplnCn", "earnEtcCn", "trgterIndvdl", "slctCritCn", "supportTarget", "servDgst", "svcPpo", "SPRT_TRGT_CN", "SUP_TRGT_CN", "TRGT_CN", "APLY_TRGT_CN", "REQST_QUALF_CN", "SLCT_CRTR_CN", "BSNS_PURPS", "PBANC_CN", "PBNS_CN", "SUP_CN", "SPRT_CN", "PBANC_NM", "BSNS_NM"]);
  const statuses: EmploymentStatus[] = [];
  if (text.includes("미취업") || text.includes("구직") || text.includes("실업") || text.includes("실직")) statuses.push("unemployed");
  if (text.includes("재직") || text.includes("근로") || text.includes("취업자") || text.includes("직장")) statuses.push("employed");
  if (text.includes("창업") || text.includes("자영") || text.includes("소상공")) statuses.push("self_employed");
  return [...new Set(statuses)];
}

function deriveApplicationDeadline(item: SourceItem): string | undefined {
  const raw = firstText(item, [
    "aplyYmd",
    "aplyPrd",
    "applicationPeriod",
    "applicationDeadline",
    "reqstBeginEndDe",
    "svcAvailPrd",
    "applicationDueDate",
    "dueDate",
    "reqstEndDe",
    "REQST_PD",
    "REQST_PERIOD",
    "RCEPT_PD",
    "RCEPT_PERIOD",
    "PBANC_PD",
    "PBNS_PD",
    "PBANC_END_DE",
    "RCEPT_END_DE",
    "REQST_END_DE",
    "APLY_END_DE"
  ]);
  if (!raw) return undefined;

  const compactMatches = [...raw.matchAll(/\d{8}/g)].map((match) => match[0]);
  const separatedMatches = [...raw.matchAll(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)].map(
    (match) => `${match[1]}${match[2].padStart(2, "0")}${match[3].padStart(2, "0")}`
  );
  const last = [...compactMatches, ...separatedMatches].at(-1);
  if (!last) return undefined;

  const isoDate = `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}`;
  try {
    return kstDeadlineToUtc(isoDate);
  } catch {
    return undefined;
  }
}

function deriveCategory(item: SourceItem): BenefitCategory {
  const text = joinedText(item, ["plcyKywdNm", "plcyExplnCn", "sprtCn", "plcyNm", "servDgst", "svcPpo", "servNm", "svcNm", "PBANC_NM", "PBNS_NM", "BSNS_NM", "ASST_BSNS_NM", "BSNS_PURPS", "BIZ_PURPS", "PBANC_CN", "PBNS_CN", "SUP_CN", "SPRT_CN", "BSNS_CN"]);
  if (text.includes("취업") || text.includes("일자리") || text.includes("구직")) return "employment";
  if (text.includes("주거") || text.includes("월세") || text.includes("임대")) return "housing";
  if (text.includes("교육") || text.includes("장학") || text.includes("훈련")) return "education";
  if (text.includes("건강") || text.includes("의료") || text.includes("돌봄")) return "health";
  if (text.includes("가족") || text.includes("출산") || text.includes("육아") || text.includes("양육") || text.includes("아동")) return "family";
  if (text.includes("청년")) return "youth";
  if (deriveRegions(item).length > 0) return "local";
  return "other";
}

function containsAny(item: SourceItem, needles: string[]): boolean {
  const text = joinedText(item, Object.keys(item));
  return needles.some((needle) => text.includes(needle));
}

function joinedText(item: SourceItem, keys: string[]): string {
  return keys.map((key) => firstText(item, [key]) ?? "").join(" ");
}

function isRecord(value: unknown): value is SourceItem {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
