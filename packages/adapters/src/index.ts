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

export interface YouthCenterRepositoryOptions {
  apiKey?: string;
  endpoint?: string;
  pageSize?: number;
  fetch?: typeof fetch;
  now?: () => Date;
  logger?: { warn: (message: string) => void };
}

type YouthCenterItem = Record<string, unknown>;

export class YouthCenterRepository implements BenefitRepository {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly pageSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly logger: { warn: (message: string) => void };

  constructor(options: YouthCenterRepositoryOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.YOUTH_CENTER_API_KEY;
    this.endpoint = options.endpoint ?? "https://apis.data.go.kr/1051000/youthPlcyList/getYouthPlcyList";
    this.pageSize = options.pageSize ?? 100;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
  }

  async search(): Promise<BenefitRecord[]> {
    if (!this.apiKey) {
      this.logger.warn("YOUTH_CENTER_API_KEY is not configured; returning no YouthCenter benefits.");
      return [];
    }

    try {
      const url = new URL(this.endpoint);
      url.searchParams.set("serviceKey", this.apiKey);
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("numOfRows", String(this.pageSize));
      url.searchParams.set("type", "json");

      const response = await this.fetchImpl(url);
      if (!response.ok) {
        this.logger.warn(`YouthCenter API request failed with HTTP ${response.status}.`);
        return [];
      }

      const payload = (await response.json()) as unknown;
      return extractYouthPolicyItems(payload)
        .map((item) => this.toBenefitRecord(item))
        .filter((record): record is BenefitRecord => record !== undefined);
    } catch (error) {
      this.logger.warn(`YouthCenter API request failed: ${messageFrom(error)}`);
      return [];
    }
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    return (await this.search()).find((record) => record.id === id);
  }

  private toBenefitRecord(item: YouthCenterItem): BenefitRecord | undefined {
    const policyNumber = firstText(item, ["plcyNo", "policyNo", "bizId", "id"]);
    const title = firstText(item, ["plcyNm", "policyName", "title"]);
    if (!policyNumber || !title) return undefined;

    const provider = firstText(item, ["sprvsnInstCdNm", "operInstCdNm", "provider", "insttNm"]) ?? "한국고용정보원";
    const summary = firstText(item, ["plcyExplnCn", "sprtCn", "summary", "plcyCn"]) ?? title;
    const target = firstText(item, ["sprtTrgtCn", "target", "ageInfo", "earnEtcCn"]) ?? "청년 정책 대상자";
    const sourceUrl = normalizeUrl(
      firstText(item, ["refUrlAddr1", "refUrlAddr2", "sourceUrl", "plcyUrlAddr"]),
      `https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifDtl.do?bizId=${encodeURIComponent(policyNumber)}`
    );
    const applicationUrl = normalizeUrl(firstText(item, ["aplyUrlAddr", "applicationUrl"]));

    const parsed = BenefitRecordSchema.safeParse({
      id: `youth-center:${policyNumber}`,
      title,
      provider,
      category: deriveCategory(item),
      summary,
      target,
      eligibility: splitList(firstText(item, ["sprtTrgtCn", "earnEtcCn", "ageInfo"])),
      applicationPeriod: firstText(item, ["aplyYmd", "aplyPrd", "applicationPeriod"]),
      applicationDeadline: deriveApplicationDeadline(item),
      documents: splitList(firstText(item, ["sbmsnDcmntCn", "documents"])).map((label, index) => ({
        id: `document-${index + 1}`,
        label,
        required: true,
        source: "youth-center"
      })),
      applicationMethods: splitList(firstText(item, ["aplyMthdCn", "applicationMethods"])),
      applicationUrl,
      sourceUrl,
      lastFetchedAt: this.now().toISOString(),
      evidence: [],
      searchableText: [summary, target, firstText(item, ["plcyKywdNm", "keywords"]), provider]
        .filter(Boolean)
        .join(" "),
      regionTags: deriveRegions(item),
      ageRanges: deriveAgeRanges(item),
      householdTypes: deriveHouseholdTypes(item),
      studentOnly: containsAny(item, ["대학생", "재학생", "학생"]),
      employmentStatuses: deriveEmploymentStatuses(item)
    });

    if (!parsed.success) {
      this.logger.warn(`YouthCenter policy ${policyNumber} did not match BenefitRecordSchema.`);
      return undefined;
    }
    return parsed.data;
  }
}

function dedupeKey(record: BenefitRecord): string {
  return `${record.sourceUrl || "no-source"}::${record.id}`.split("::")[0] || record.id;
}

function extractYouthPolicyItems(payload: unknown): YouthCenterItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [
    root.result,
    root.response,
    root.body,
    root
  ].filter((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === "object") as Record<string, unknown>[];

  for (const candidate of candidates) {
    for (const key of ["youthPolicyList", "youthPlcyList", "items", "item"]) {
      const value = candidate[key];
      if (Array.isArray(value)) return value.filter(isRecord);
      if (isRecord(value)) return [value];
    }
  }
  return [];
}

function firstText(item: YouthCenterItem, keys: string[]): string | undefined {
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

function deriveRegions(item: YouthCenterItem): string[] {
  const text = joinedText(item, ["zipCd", "region", "rgonNm", "sprvsnInstCdNm", "plcyExplnCn"]);
  const regions = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  return regions.filter((region) => text.includes(region));
}

function deriveAgeRanges(item: YouthCenterItem): AgeRange[] {
  const min = Number(firstText(item, ["sprtTrgtMinAge", "minAge"]));
  const max = Number(firstText(item, ["sprtTrgtMaxAge", "maxAge"]));
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
  const text = joinedText(item, ["ageInfo", "sprtTrgtCn", "plcyExplnCn"]);
  return ranges.filter(([, start]) => text.includes(`${Math.floor(start / 10) * 10}대`)).map(([range]) => range);
}

function deriveHouseholdTypes(item: YouthCenterItem): HouseholdType[] {
  const text = joinedText(item, ["earnEtcCn", "sprtTrgtCn", "plcyExplnCn"]);
  const types: HouseholdType[] = [];
  if (text.includes("1인") || text.includes("단독")) types.push("single");
  if (text.includes("부부")) types.push("couple");
  if (text.includes("가족") || text.includes("가구")) types.push("family");
  if (text.includes("한부모")) types.push("single_parent");
  return [...new Set(types)];
}

function deriveEmploymentStatuses(item: YouthCenterItem): EmploymentStatus[] {
  const text = joinedText(item, ["plcyKywdNm", "sprtTrgtCn", "plcyExplnCn", "earnEtcCn"]);
  const statuses: EmploymentStatus[] = [];
  if (text.includes("미취업") || text.includes("구직") || text.includes("실업")) statuses.push("unemployed");
  if (text.includes("재직") || text.includes("근로") || text.includes("취업자")) statuses.push("employed");
  if (text.includes("창업") || text.includes("자영")) statuses.push("self_employed");
  return [...new Set(statuses)];
}

function deriveApplicationDeadline(item: YouthCenterItem): string | undefined {
  const raw = firstText(item, ["aplyYmd", "aplyPrd", "applicationPeriod", "applicationDeadline"]);
  if (!raw) return undefined;

  const compactMatches = [...raw.matchAll(/\d{8}/g)].map((match) => match[0]);
  const separatedMatches = [...raw.matchAll(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)].map(
    (match) => `${match[1]}${match[2].padStart(2, "0")}${match[3].padStart(2, "0")}`
  );
  const last = [...compactMatches, ...separatedMatches].at(-1);
  if (!last) return undefined;

  // YouthCenter date-only deadlines are Korean local dates. Delegate the KST→UTC
  // contract (and date validation) to the shared core helper so a single
  // implementation owns the policy; invalid dates are skipped, not rolled over.
  const isoDate = `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}`;
  try {
    return kstDeadlineToUtc(isoDate);
  } catch {
    return undefined;
  }
}

function deriveCategory(item: YouthCenterItem): BenefitCategory {
  const text = joinedText(item, ["plcyKywdNm", "plcyExplnCn", "sprtCn", "plcyNm"]);
  if (text.includes("취업") || text.includes("일자리") || text.includes("구직")) return "employment";
  if (text.includes("주거") || text.includes("월세") || text.includes("임대")) return "housing";
  if (text.includes("교육") || text.includes("장학") || text.includes("훈련")) return "education";
  if (text.includes("건강") || text.includes("의료")) return "health";
  if (text.includes("가족") || text.includes("출산") || text.includes("육아")) return "family";
  if (text.includes("청년")) return "youth";
  return "other";
}

function containsAny(item: YouthCenterItem, needles: string[]): boolean {
  const text = joinedText(item, Object.keys(item));
  return needles.some((needle) => text.includes(needle));
}

function joinedText(item: YouthCenterItem, keys: string[]): string {
  return keys.map((key) => firstText(item, [key]) ?? "").join(" ");
}

function isRecord(value: unknown): value is YouthCenterItem {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
