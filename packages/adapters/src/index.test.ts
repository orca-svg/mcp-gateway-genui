import { describe, expect, it, vi } from "vitest";
import { BenefitRecordSchema, type BenefitRecord } from "@mcp-gen-ui/schema";
import {
  BokjiroRepository,
  CachingBenefitRepository,
  CompositeBenefitRepository,
  SubsidyRepository,
  YouthCenterRepository
} from "./index.js";
import type { BenefitRepository } from "@mcp-gen-ui/core";

function benefit(overrides: Partial<BenefitRecord>): BenefitRecord {
  return BenefitRecordSchema.parse({
    id: "benefit-1",
    title: "청년 지원 정책",
    provider: "한국고용정보원",
    category: "youth",
    summary: "청년 지원 요약",
    target: "만 19세 이상 34세 이하 청년",
    eligibility: ["서울 거주", "미취업 청년"],
    applicationPeriod: "2026-01-01~2026-12-31",
    documents: [],
    applicationMethods: ["온라인 신청"],
    applicationUrl: "https://www.youthcenter.go.kr/apply",
    sourceUrl: "https://www.youthcenter.go.kr/policy/1",
    lastFetchedAt: "2026-06-01T00:00:00.000Z",
    evidence: [],
    searchableText: "청년 서울 미취업",
    regionTags: ["서울"],
    ageRanges: ["twenties", "thirties"],
    studentOnly: false,
    employmentStatuses: ["unemployed"],
    ...overrides
  });
}

class MemoryRepository implements BenefitRepository {
  public searches = 0;

  constructor(private readonly records: BenefitRecord[]) {}

  async search(): Promise<BenefitRecord[]> {
    this.searches += 1;
    return this.records;
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }
}

describe("CompositeBenefitRepository", () => {
  it("fans in repositories and dedupes by sourceUrl before id", async () => {
    const canonical = benefit({ id: "canonical", sourceUrl: "https://example.test/policy/1" });
    const duplicate = benefit({
      id: "duplicate-id",
      title: "중복 정책",
      sourceUrl: "https://example.test/policy/1"
    });
    const unique = benefit({ id: "unique", sourceUrl: "https://example.test/policy/2" });

    const repository = new CompositeBenefitRepository([
      new MemoryRepository([canonical, unique]),
      new MemoryRepository([duplicate])
    ]);

    await expect(repository.search()).resolves.toEqual([canonical, unique]);
    await expect(repository.getById("unique")).resolves.toEqual(unique);
  });
});

describe("CachingBenefitRepository", () => {
  it("caches search and getById results until the TTL expires", async () => {
    let now = 1_000;
    const backing = new MemoryRepository([benefit({ id: "cached" })]);
    const repository = new CachingBenefitRepository(backing, {
      ttlMs: 500,
      now: () => now
    });

    await repository.search();
    await repository.search();
    expect(backing.searches).toBe(1);

    now = 1_501;
    await repository.search();
    expect(backing.searches).toBe(2);

    await repository.getById("cached");
    await repository.getById("cached");
    expect(backing.searches).toBe(2);
  });
});

describe("public benefit API repositories", () => {
  const recordedBokjiroResponse = {
    response: {
      body: {
        items: {
          item: [
            {
              servId: "WLF00004660",
              servNm: "서울형 긴급복지 지원",
              jurMnofNm: "서울특별시",
              servDgst: "서울 위기가구에 생계·의료비를 지원합니다.",
              trgterIndvdl: "서울 거주 1인 가구 및 가족 위기가구",
              slctCritCn: "소득 감소 또는 실직으로 생계가 곤란한 가구",
              reqstBeginEndDe: "2026.01.01 ~ 2026.11.30",
              reqstMthPapers: "방문 신청",
              pprsUpdtCn: "신분증<br/>소득 확인서",
              servDtlLink: "https://www.bokjiro.go.kr/policy/WLF00004660"
            }
          ]
        }
      }
    }
  };

  const recordedSubsidyResponse = {
    response: {
      body: {
        items: {
          item: [
            {
              PBANC_ID: "PBNS202600001",
              PBANC_NM: "부산 청년 월세 지원 공모",
              PBANC_INST_NM: "부산광역시",
              BSNS_PURPS: "부산 거주 청년과 대학생에게 월세를 지원합니다.",
              SPRT_TRGT_CN: "만 19세 이상 34세 이하 미취업 청년 1인 가구",
              RCEPT_PD: "2026-09-01 ~ 2026-10-15",
              REQST_MTH_CN: "온라인 신청",
              PBANC_URL: "https://www.bojo.go.kr/bojo.do?pbancId=PBNS202600001",
              SBMSN_DCMNT_CN: "주민등록등본, 임대차계약서"
            }
          ]
        }
      }
    }
  };

  it("maps recorded 복지로 responses into valid BenefitRecords with scoring fields", async () => {
    const repository = new BokjiroRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response(JSON.stringify(recordedBokjiroResponse), { status: 200 })),
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const records = await repository.search();

    expect(records).toHaveLength(1);
    expect(BenefitRecordSchema.safeParse(records[0]).success).toBe(true);
    expect(records[0]).toMatchObject({
      id: "bokjiro:WLF00004660",
      title: "서울형 긴급복지 지원",
      provider: "서울특별시",
      category: "health",
      applicationDeadline: "2026-11-30T14:59:59.000Z",
      regionTags: ["서울"],
      householdTypes: ["single", "family"],
      employmentStatuses: ["unemployed"],
      sourceUrl: "https://www.bokjiro.go.kr/policy/WLF00004660"
    });
    expect(records[0].documents.map((document) => document.label)).toEqual(["신분증", "소득 확인서"]);
  });

  it("maps recorded 보조금24 responses and composes with 복지로 using source URL dedupe", async () => {
    const bokjiro = new BokjiroRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response(JSON.stringify(recordedBokjiroResponse), { status: 200 })),
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });
    const subsidyFetch = vi.fn(async () => new Response(JSON.stringify(recordedSubsidyResponse), { status: 200 }));
    const subsidy = new SubsidyRepository({
      apiKey: "runtime-key-only",
      fetch: subsidyFetch,
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });
    const duplicateSubsidy = new SubsidyRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response(JSON.stringify(recordedSubsidyResponse), { status: 200 })),
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const records = await new CompositeBenefitRepository([bokjiro, subsidy, duplicateSubsidy]).search();

    expect(records).toHaveLength(2);
    const requestedUrl = new URL(String(subsidyFetch.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/1051000/MoefOpenAPI/T_OPD_PBNS");
    expect(requestedUrl.searchParams.get("resultType")).toBe("json");
    expect(requestedUrl.searchParams.has("bsnsyear")).toBe(false);

    const subsidyRecord = records.find((record) => record.id === "subsidy24:PBNS202600001");
    expect(subsidyRecord).toMatchObject({
      title: "부산 청년 월세 지원 공모",
      provider: "부산광역시",
      category: "housing",
      applicationDeadline: "2026-10-15T14:59:59.000Z",
      regionTags: ["부산"],
      ageRanges: ["thirties", "twenties"],
      householdTypes: ["single", "family"],
      studentOnly: true,
      employmentStatuses: ["unemployed"],
      applicationUrl: "https://www.bojo.go.kr/bojo.do?pbancId=PBNS202600001",
      sourceUrl: "https://www.bojo.go.kr/bojo.do?pbancId=PBNS202600001"
    });
    expect(BenefitRecordSchema.safeParse(subsidyRecord).success).toBe(true);
  });

  it("returns an empty list and warns when 복지로 has no runtime API key", async () => {
    const warn = vi.fn();
    const fetch = vi.fn();
    const repository = new BokjiroRepository({ apiKey: "", fetch, logger: { warn } });

    await expect(repository.search()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("BOKJIRO_API_KEY"));
  });

  it("returns an empty list and warns when 보조금24 live API call fails", async () => {
    const warn = vi.fn();
    const repository = new SubsidyRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response("Service unavailable", { status: 503 })),
      logger: { warn }
    });

    await expect(repository.search()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("503"));
  });
});

describe("YouthCenterRepository", () => {
  const recordedResponse = {
    resultCode: "00",
    resultMessage: "NORMAL SERVICE.",
    result: {
      youthPolicyList: [
        {
          plcyNo: "R202506010001",
          plcyNm: "서울 청년 취업 지원금",
          sprvsnInstCdNm: "서울특별시",
          plcyExplnCn: "서울 미취업 청년에게 취업 준비금을 지원합니다.",
          sprtTrgtMinAge: "19",
          sprtTrgtMaxAge: "34",
          zipCd: "서울",
          earnEtcCn: "1인 가구 및 구직 청년 우대",
          plcyKywdNm: "취업,일자리,청년",
          aplyYmd: "20260601~20261231",
          aplyUrlAddr: "https://www.youthcenter.go.kr/apply",
          refUrlAddr1: "https://www.youthcenter.go.kr/policy/R202506010001",
          sbmsnDcmntCn: "신분증, 구직활동계획서",
          aplyMthdCn: "온라인 신청",
          sprtCn: "월 50만원 지원"
        }
      ]
    }
  };

  it("maps recorded 온통청년 responses into valid BenefitRecords with scoring fields", async () => {
    const repository = new YouthCenterRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response(JSON.stringify(recordedResponse), { status: 200 })),
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const records = await repository.search();

    expect(records).toHaveLength(1);
    expect(BenefitRecordSchema.safeParse(records[0]).success).toBe(true);
    expect(records[0]).toMatchObject({
      id: "youth-center:R202506010001",
      title: "서울 청년 취업 지원금",
      provider: "서울특별시",
      category: "employment",
      applicationPeriod: "20260601~20261231",
      applicationDeadline: "2026-12-31T14:59:59.000Z",
      regionTags: ["서울"],
      ageRanges: ["twenties", "thirties"],
      householdTypes: ["single", "family"],
      employmentStatuses: ["unemployed"],
      applicationUrl: "https://www.youthcenter.go.kr/apply",
      sourceUrl: "https://www.youthcenter.go.kr/policy/R202506010001"
    });
    expect(records[0].documents.map((document) => document.label)).toEqual([
      "신분증",
      "구직활동계획서"
    ]);
  });

  it("skips invalid application deadline dates instead of rolling them over", async () => {
    const responseWithInvalidDeadline = {
      ...recordedResponse,
      result: {
        youthPolicyList: [
          { ...recordedResponse.result.youthPolicyList[0], aplyYmd: "20260101~20261340" }
        ]
      }
    };
    const repository = new YouthCenterRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response(JSON.stringify(responseWithInvalidDeadline), { status: 200 })),
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const records = await repository.search();

    expect(records).toHaveLength(1);
    expect(records[0].applicationDeadline).toBeUndefined();
    expect(BenefitRecordSchema.safeParse(records[0]).success).toBe(true);
  });

  it("returns an empty list and warns when no runtime API key is configured", async () => {
    const warn = vi.fn();
    const fetch = vi.fn();
    const repository = new YouthCenterRepository({ apiKey: "", fetch, logger: { warn } });

    await expect(repository.search()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("YOUTH_CENTER_API_KEY"));
  });

  it("returns an empty list and warns when the live API call fails", async () => {
    const warn = vi.fn();
    const repository = new YouthCenterRepository({
      apiKey: "runtime-key-only",
      fetch: vi.fn(async () => new Response("Service unavailable", { status: 503 })),
      logger: { warn }
    });

    await expect(repository.search()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("503"));
  });
});
