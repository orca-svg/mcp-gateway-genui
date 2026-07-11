import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AdapterResultSchema,
  BenefitRecordSchema,
  BenefitRepositoryResultSchema,
  OPAQUE_ID_PATTERN,
  type AdapterResult,
  type BenefitRepositoryResult,
  type SourceObservation
} from "@mcp-gen-ui/schema";
import type { BenefitRepository } from "@mcp-gen-ui/core";
import {
  ADAPTER_VERSION,
  BokjiroRepository,
  CachingBenefitRepository,
  CompositeBenefitRepository,
  SubsidyRepository,
  YouthCenterRepository,
  type BenefitSourceAdapter
} from "./index.js";

const FIXED_NOW = new Date("2026-07-10T00:00:00.000Z");
const fixtureUrl = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

const youthCenterPayload = JSON.parse(
  readFileSync(fixtureUrl("youth-center-list.json"), "utf8")
) as Record<string, unknown>;
const subsidyPayload = JSON.parse(
  readFileSync(fixtureUrl("subsidy-open-calls.json"), "utf8")
) as Record<string, unknown>;
const singleSubsidyPayload = JSON.parse(
  readFileSync(fixtureUrl("subsidy-open-call-single.json"), "utf8")
) as Record<string, unknown>;
const bokjiroSuccessXml = readFileSync(
  fixtureUrl("bokjiro-wanted-list-success.xml"),
  "utf8"
);
const bokjiroErrorXml = readFileSync(
  fixtureUrl("bokjiro-wanted-list-error.xml"),
  "utf8"
);

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function xmlResponse(payload: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/xml");
  return new Response(payload, { ...init, headers });
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function sourceItem(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload.result as { youthPolicyList: Array<Record<string, unknown>> };
  return result.youthPolicyList[0]!;
}

function observation(
  sourceId: string,
  status: SourceObservation["status"],
  recordCount = 0
): SourceObservation {
  return {
    sourceId,
    status,
    retrievedAt: FIXED_NOW.toISOString(),
    recordCount,
    errorCode: status === "ok" ? undefined : status,
    adapterVersion: ADAPTER_VERSION
  };
}

function failedResult(
  sourceId: string,
  status: SourceObservation["status"]
): AdapterResult {
  return AdapterResultSchema.parse({
    records: [],
    observation: observation(sourceId, status)
  });
}

class StaticSourceAdapter implements BenefitSourceAdapter {
  readonly adapterVersion = ADAPTER_VERSION;
  calls = 0;

  constructor(
    readonly sourceId: string,
    private readonly result: AdapterResult | Error
  ) {}

  async search(): Promise<AdapterResult> {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class MemoryRepository implements BenefitRepository {
  readonly mode = "mixed" as const;
  searches = 0;

  constructor(private readonly result: BenefitRepositoryResult) {}

  async search(): Promise<BenefitRepositoryResult> {
    this.searches += 1;
    return this.result;
  }

  async getById(id: string) {
    return {
      record: this.result.records.find((record) => record.id === id),
      dataStatus: this.result.dataStatus
    };
  }
}

describe("YouthCenterRepository", () => {
  it("maps normalized records with authoritative structured rules, lineage, and separate links", async () => {
    const fetch = vi.fn(async () => jsonResponse(youthCenterPayload));
    const repository = new YouthCenterRepository({
      apiKey: "runtime-key-only",
      fetch: fetch as typeof globalThis.fetch,
      now: () => FIXED_NOW
    });

    const result = await repository.search();

    expect(result.observation).toEqual({
      sourceId: "youth-center",
      status: "ok",
      retrievedAt: FIXED_NOW.toISOString(),
      recordCount: 1,
      adapterVersion: ADAPTER_VERSION
    });
    expect(result.records).toHaveLength(1);
    const record = result.records[0]!;
    expect(BenefitRecordSchema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({
      id: "youth-center:R202607100001",
      sourceId: "youth-center",
      sourceRecordId: "R202607100001",
      title: "서울 청년 취업 지원금",
      provider: "서울특별시",
      category: "employment",
      applicationDeadline: "2026-12-31T14:59:59.000Z",
      lastFetchedAt: FIXED_NOW.toISOString()
    });
    expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.eligibility).toContain("제외/제한: 재직자는 참여 제한");
    expect(record.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "region",
          allowedValues: ["KR-11"],
          basis: "authoritative_structured",
          sourceFields: ["zipCd"]
        }),
        expect.objectContaining({
          dimension: "age",
          basis: "authoritative_structured",
          sourceFields: ["sprtTrgtMinAge", "sprtTrgtMaxAge"]
        }),
        expect.objectContaining({
          dimension: "employment",
          allowedValues: ["unemployed"],
          basis: "derived_text"
        })
      ])
    );
    expect(record.provenance.map((entry) => entry.field)).toEqual(
      expect.arrayContaining([
        "/title",
        "/summary",
        "/eligibility",
        "/applicationDeadline",
        "/documents",
        "/applicationMethods"
      ])
    );
    expect(record.provenance.every((entry) => entry.contentHash === record.contentHash)).toBe(
      true
    );
    expect(record.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "source", official: true, health: "verified" }),
        expect.objectContaining({ rel: "apply", official: true, health: "verified" })
      ])
    );

    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.origin).toBe("https://www.youthcenter.go.kr");
    expect(requestedUrl.pathname).toBe("/go/ythip/getPlcy");
    expect(requestedUrl.searchParams.get("apiKeyNm")).toBe("runtime-key-only");
    expect(requestedUrl.searchParams.get("pageNum")).toBe("1");
    expect(requestedUrl.searchParams.get("pageType")).toBe("1");
    expect(requestedUrl.searchParams.get("rtnType")).toBe("json");
    expect(requestedUrl.searchParams.get("serviceKey")).toBeNull();
  });

  it("normalizes hostile display text and hashes a non-opaque source id", async () => {
    const payload = deepClone(youthCenterPayload);
    const item = sourceItem(payload);
    item.plcyNo = "bad id/with spaces";
    item.plcyNm = "\u200B  청년\u0000지원  ";
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    const result = await repository.search();
    const record = result.records[0]!;

    expect(record.title).toBe("청년 지원");
    expect(OPAQUE_ID_PATTERN.test(record.id)).toBe(true);
    expect(record.id).not.toContain("bad id/with spaces");
    expect(record.sourceRecordId).toBe("bad id/with spaces");
  });

  it("marks rejected records as a partial source result", async () => {
    const payload = deepClone(youthCenterPayload);
    const result = payload.result as {
      pagging: { totCount: number };
      youthPolicyList: Array<Record<string, unknown>>;
    };
    result.youthPolicyList.push({ plcyNo: "missing-title" });
    result.pagging.totCount = 2;
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    const response = await repository.search();

    expect(response.records).toHaveLength(1);
    expect(response.observation).toMatchObject({
      status: "partial",
      errorCode: "invalid_record",
      recordCount: 1
    });
  });

  it("marks first-page coverage as partial when the source reports more records", async () => {
    const payload = deepClone(youthCenterPayload);
    const result = payload.result as { pagging: { totCount: number } };
    result.pagging.totCount = 2;
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [{ id: "youth-center:R202607100001" }],
      observation: {
        status: "partial",
        errorCode: "page_truncated",
        recordCount: 1
      }
    });
  });

  it("rejects a malformed YouthCenter total count", async () => {
    const payload = deepClone(youthCenterPayload);
    const result = payload.result as { pagging: { totCount: unknown } };
    result.pagging.totCount = "many";
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
  });

  it("returns stable timeout, content-type, and oversized-payload observations", async () => {
    const timeoutRepository = new YouthCenterRepository({
      apiKey: "key",
      fetch: () => new Promise<Response>(() => undefined),
      timeoutMs: 10,
      now: () => FIXED_NOW
    });
    const invalidTypeRepository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () =>
        new Response("secret upstream body", {
          status: 200,
          headers: { "Content-Type": "text/html" }
        }),
      now: () => FIXED_NOW
    });
    const oversizedRepository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "100"
          }
        }),
      maxPayloadBytes: 10,
      now: () => FIXED_NOW
    });

    await expect(timeoutRepository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "timeout", errorCode: "timeout" }
    });
    await expect(invalidTypeRepository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_content_type" }
    });
    await expect(oversizedRepository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "payload_too_large" }
    });
  });

  it("retains HTTP and fake-government evidence as unofficial links", async () => {
    const payload = deepClone(youthCenterPayload);
    const item = sourceItem(payload);
    item.refUrlAddr1 = "https://gov.kr.evil.example/policy/1";
    item.aplyUrlAddr = "http://www.youthcenter.go.kr/apply/1";
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    const record = (await repository.search()).records[0]!;

    expect(record.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rel: "source",
          url: "https://gov.kr.evil.example/policy/1",
          official: false,
          health: "unchecked"
        }),
        expect.objectContaining({
          rel: "apply",
          url: "http://www.youthcenter.go.kr/apply/1",
          official: false,
          health: "unreachable"
        }),
        expect.objectContaining({ rel: "source", official: true })
      ])
    );
  });

  it("drops links containing credential-like query parameters", async () => {
    const payload = deepClone(youthCenterPayload);
    const item = sourceItem(payload);
    item.refUrlAddr1 = "https://www.youthcenter.go.kr/policy/1?serviceKey=secret";
    item.aplyUrlAddr = "https://www.youthcenter.go.kr/apply/1?access_token=secret";
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    const record = (await repository.search()).records[0]!;

    expect(record.links.some((link) => link.url.includes("secret"))).toBe(false);
    expect(record.links).toEqual(
      expect.arrayContaining([expect.objectContaining({ rel: "source", official: true })])
    );
  });

  it("drops localhost and private-network links from untrusted source data", async () => {
    const payload = deepClone(youthCenterPayload);
    const item = sourceItem(payload);
    item.refUrlAddr1 = "http://127.0.0.1:8080/admin?policy=1";
    item.aplyUrlAddr = "https://service.internal/apply/1";
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    const record = (await repository.search()).records[0]!;

    expect(record.links.some((link) => /127\.0\.0\.1|\.internal/iu.test(link.url))).toBe(false);
    expect(record.links).toEqual(
      expect.arrayContaining([expect.objectContaining({ rel: "source", official: true })])
    );
  });

  it("classifies a malformed record collection as an invalid payload", async () => {
    const payload = deepClone(youthCenterPayload);
    const result = payload.result as Record<string, unknown>;
    result.youthPolicyList = ["not-a-record"];
    const repository = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
  });

  it("returns an unavailable observation instead of fixture data when the key is missing", async () => {
    const fetch = vi.fn();
    const repository = new YouthCenterRepository({
      apiKey: "",
      fetch: fetch as typeof globalThis.fetch,
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: {
        sourceId: "youth-center",
        status: "unavailable",
        errorCode: "missing_configuration"
      }
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps content hashes stable across observation times", async () => {
    const first = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(youthCenterPayload),
      now: () => new Date("2026-07-10T00:00:00.000Z")
    });
    const second = new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(youthCenterPayload),
      now: () => new Date("2026-07-11T00:00:00.000Z")
    });

    const firstRecord = (await first.search()).records[0]!;
    const secondRecord = (await second.search()).records[0]!;

    expect(firstRecord.contentHash).toBe(secondRecord.contentHash);
    expect(firstRecord.lastFetchedAt).not.toBe(secondRecord.lastFetchedAt);
  });
});

describe("BokjiroRepository", () => {
  it("parses the actual wantedList XML envelope and required query parameters", async () => {
    const fetch = vi.fn(async () => xmlResponse(bokjiroSuccessXml));
    const repository = new BokjiroRepository({
      apiKey: "runtime-key-only",
      fetch: fetch as typeof globalThis.fetch,
      now: () => FIXED_NOW
    });

    const result = await repository.search();

    expect(result.observation).toMatchObject({ status: "ok", recordCount: 2 });
    expect(result.records.map((record) => record.id)).toEqual([
      "bokjiro:WLF00004660",
      "bokjiro:WLF00000060"
    ]);
    expect(result.records.every((record) => BenefitRecordSchema.safeParse(record).success)).toBe(
      true
    );
    const youthTitleRecord = result.records[0]!;
    expect(youthTitleRecord.applicationPeriod).toBeUndefined();
    expect(
      youthTitleRecord.provenance.some((entry) => entry.field === "/applicationPeriod")
    ).toBe(false);
    expect(
      youthTitleRecord.constraints.filter((constraint) => constraint.dimension === "age")
    ).toEqual([
      expect.objectContaining({
        allowedValues: ["twenties", "thirties"],
        basis: "derived_text"
      })
    ]);
    expect(
      youthTitleRecord.constraints.some(
        (constraint) =>
          constraint.dimension === "age" && constraint.basis === "authoritative_structured"
      )
    ).toBe(false);

    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("callTp")).toBe("L");
    expect(requestedUrl.searchParams.get("srchKeyCode")).toBe("003");
    expect(requestedUrl.searchParams.get("resultType")).toBeNull();
  });

  it("maps a wantedList error envelope to a stable unavailable observation", async () => {
    const repository = new BokjiroRepository({
      apiKey: "key",
      fetch: async () => xmlResponse(bokjiroErrorXml),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "unavailable", errorCode: "upstream_error" }
    });
  });

  it("rejects malformed wantedList XML without exposing parser details", async () => {
    const warn = vi.fn();
    const repository = new BokjiroRepository({
      apiKey: "key",
      fetch: async () => xmlResponse("<wantedList><servList>"),
      logger: { warn },
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
    expect(warn).toHaveBeenCalledWith("bokjiro:invalid_payload");
  });

  it("rejects a successful Bokjiro envelope whose positive total has no records", async () => {
    const payload = bokjiroSuccessXml.replace(/\s*<servList>[\s\S]*?<\/servList>/gu, "");
    const repository = new BokjiroRepository({
      apiKey: "key",
      fetch: async () => xmlResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
  });

  it("rejects a malformed success envelope without a result code or numeric total", async () => {
    const withoutResultCode = bokjiroSuccessXml.replace(
      /\s*<resultCode>0<\/resultCode>/u,
      ""
    );
    const malformedTotal = bokjiroSuccessXml.replace(
      "<totalCount>2</totalCount>",
      "<totalCount>many</totalCount>"
    );

    for (const payload of [withoutResultCode, malformedTotal]) {
      const repository = new BokjiroRepository({
        apiKey: "key",
        fetch: async () => xmlResponse(payload),
        now: () => FIXED_NOW
      });

      await expect(repository.search()).resolves.toMatchObject({
        records: [],
        observation: { status: "invalid_payload", errorCode: "invalid_payload" }
      });
    }
  });
});

describe("SubsidyRepository", () => {
  it("uses the current official endpoint, required year, and real field names", async () => {
    const fetch = vi.fn(async () => jsonResponse(subsidyPayload));
    const repository = new SubsidyRepository({
      apiKey: "runtime-key-only",
      fetch: fetch as typeof globalThis.fetch,
      now: () => FIXED_NOW
    });

    const result = await repository.search();

    expect(result.observation).toMatchObject({ status: "ok", recordCount: 2 });
    expect(result.records).toHaveLength(2);
    const first = result.records[0]!;
    expect(first).toMatchObject({
      id: "subsidy24:SUBSIDY-2026-001",
      title: "2026 부산 청년 월세 지원 공고",
      provider: "부산광역시",
      category: "housing",
      applicationPeriod: "2026-07-01 ~ 2026-07-31",
      applicationDeadline: "2026-07-31T14:59:59.000Z"
    });
    expect(first.documents.map((document) => document.label)).toEqual([
      "신청서",
      "주거 확인 서류"
    ]);
    expect(first.eligibility).toContain("제외/제한: 중복 지원자는 제외될 수 있음");
    expect(first.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "region",
          allowedValues: ["KR-26"],
          basis: "authoritative_structured",
          sourceFields: ["CTPRVN_NM"]
        }),
        expect.objectContaining({ dimension: "age", basis: "derived_text" }),
        expect.objectContaining({ dimension: "student", basis: "derived_text" })
      ])
    );
    expect(first.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rel: "source",
          official: true,
          health: "verified"
        })
      ])
    );
    expect(result.records[1]!.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ official: true, health: "stale" })
      ])
    );

    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(
      "/1051000/MoefOpenAPI2025/T_OPD_ASBS_PBNS_UNITY"
    );
    expect(requestedUrl.searchParams.get("bsnsyear")).toBe("2026");
    expect(requestedUrl.searchParams.get("resultType")).toBe("json");
  });

  it("accepts an official response with a singular items.item object", async () => {
    const repository = new SubsidyRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(singleSubsidyPayload),
      now: () => FIXED_NOW
    });

    const result = await repository.search();

    expect(result.observation).toMatchObject({ status: "ok", recordCount: 1 });
    expect(result.records[0]).toMatchObject({
      id: "subsidy24:SUBSIDY-2026-003",
      title: "2026 가족 돌봄 지원 공고"
    });
  });

  it("uses the Korean calendar year at the UTC year boundary", async () => {
    const fetch = vi.fn(async () => jsonResponse(singleSubsidyPayload));
    const repository = new SubsidyRepository({
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      now: () => new Date("2026-12-31T15:30:00.000Z")
    });

    await repository.search();

    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("bsnsyear")).toBe("2027");
  });

  it("rejects a subsidy envelope without a declared total count", async () => {
    const payload = deepClone(singleSubsidyPayload);
    const response = payload.response as { body: Record<string, unknown> };
    delete response.body.totalCount;
    const repository = new SubsidyRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
  });

  it("rejects a subsidy success envelope without its required result code", async () => {
    const payload = deepClone(singleSubsidyPayload);
    const response = payload.response as { header: Record<string, unknown> };
    delete response.header.resultCode;
    const repository = new SubsidyRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
      now: () => FIXED_NOW
    });

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      observation: { status: "invalid_payload", errorCode: "invalid_payload" }
    });
  });
});

describe("source-aware composite and cache", () => {
  async function successfulYouthResult(): Promise<AdapterResult> {
    return new YouthCenterRepository({
      apiKey: "key",
      fetch: async () => jsonResponse(youthCenterPayload),
      now: () => FIXED_NOW
    }).search();
  }

  it("preserves one-source failure while returning successful source records", async () => {
    const youth = new StaticSourceAdapter("youth-center", await successfulYouthResult());
    const bokjiro = new StaticSourceAdapter("bokjiro", failedResult("bokjiro", "timeout"));
    const repository = new CompositeBenefitRepository([youth, bokjiro], {
      mode: "mixed",
      now: () => FIXED_NOW
    });

    const result = await repository.search();

    expect(result.records).toHaveLength(1);
    expect(result.dataStatus).toEqual({
      mode: "mixed",
      partial: true,
      sources: [
        expect.objectContaining({ sourceId: "youth-center", status: "ok" }),
        expect.objectContaining({ sourceId: "bokjiro", status: "timeout" })
      ]
    });
  });

  it("preserves an all-source failure instead of returning an unmarked empty success", async () => {
    const repository = new CompositeBenefitRepository(
      [
        new StaticSourceAdapter("youth-center", failedResult("youth-center", "timeout")),
        new StaticSourceAdapter("bokjiro", failedResult("bokjiro", "unavailable"))
      ],
      { mode: "live", now: () => FIXED_NOW }
    );

    const result = await repository.search();

    expect(result.records).toEqual([]);
    expect(result.dataStatus).toMatchObject({
      mode: "live",
      partial: true,
      sources: [
        { sourceId: "youth-center", status: "timeout" },
        { sourceId: "bokjiro", status: "unavailable" }
      ]
    });
  });

  it("converts an unexpected adapter throw into a redacted unavailable observation", async () => {
    const warn = vi.fn();
    const repository = new CompositeBenefitRepository(
      [new StaticSourceAdapter("bokjiro", new Error("secret key and stack"))],
      { mode: "live", now: () => FIXED_NOW, warn }
    );

    const result = await repository.search();

    expect(result.dataStatus.sources[0]).toMatchObject({
      sourceId: "bokjiro",
      status: "unavailable",
      errorCode: "adapter_failure"
    });
    expect(warn).toHaveBeenCalledWith("bokjiro:adapter_failure");
  });

  it("rejects incoherent custom-adapter metadata without trusting its records", async () => {
    const successful = await successfulYouthResult();
    const incoherent = AdapterResultSchema.parse({
      records: successful.records,
      observation: {
        ...successful.observation,
        recordCount: 0
      }
    });
    const repository = new CompositeBenefitRepository(
      [new StaticSourceAdapter("youth-center", incoherent)],
      { mode: "live", now: () => FIXED_NOW }
    );

    await expect(repository.search()).resolves.toMatchObject({
      records: [],
      dataStatus: {
        partial: true,
        sources: [
          {
            sourceId: "youth-center",
            status: "invalid_payload",
            recordCount: 0,
            errorCode: "invalid_payload"
          }
        ]
      }
    });
  });

  it("rejects duplicate source identities at composition time", () => {
    const first = new StaticSourceAdapter("bokjiro", failedResult("bokjiro", "timeout"));
    const second = new StaticSourceAdapter("bokjiro", failedResult("bokjiro", "timeout"));

    expect(() => new CompositeBenefitRepository([first, second])).toThrow(
      "Adapter transport configuration is invalid."
    );
  });

  it("does not collapse distinct records that share a dataset fallback link", async () => {
    const withoutDetailLinks = bokjiroSuccessXml.replace(
      /\s*<servDtlLink>[^<]*<\/servDtlLink>/gu,
      ""
    );
    const sourceResult = await new BokjiroRepository({
      apiKey: "key",
      fetch: async () => xmlResponse(withoutDetailLinks),
      now: () => FIXED_NOW
    }).search();
    expect(sourceResult.records).toHaveLength(2);
    expect(
      new Set(sourceResult.records.flatMap((record) => record.links.map((link) => link.url))).size
    ).toBe(1);

    const repository = new CompositeBenefitRepository(
      [new StaticSourceAdapter("bokjiro", sourceResult)],
      { mode: "live", now: () => FIXED_NOW }
    );

    await expect(repository.search()).resolves.toMatchObject({
      records: [{ id: "bokjiro:WLF00004660" }, { id: "bokjiro:WLF00000060" }]
    });
  });

  it("caches full source-aware search and detail results without losing observations", async () => {
    const sourceResult = await successfulYouthResult();
    const result = BenefitRepositoryResultSchema.parse({
      records: sourceResult.records,
      dataStatus: {
        mode: "mixed",
        partial: false,
        sources: [sourceResult.observation]
      }
    });
    const backing = new MemoryRepository(result);
    let now = 1_000;
    const repository = new CachingBenefitRepository(backing, {
      ttlMs: 500,
      now: () => now
    });

    const first = await repository.search();
    const second = await repository.search();
    const detail = await repository.getById(result.records[0]!.id);

    expect(second).toEqual(first);
    expect(detail.dataStatus).toEqual(first.dataStatus);
    expect(detail.record?.id).toBe(result.records[0]!.id);
    expect(backing.searches).toBe(1);

    now = 1_501;
    await repository.search();
    expect(backing.searches).toBe(2);
  });
});
