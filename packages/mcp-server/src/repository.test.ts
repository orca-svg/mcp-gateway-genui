import { describe, expect, it, vi } from "vitest";
import { fixtureBenefits } from "@mcp-gen-ui/core";
import { buildBenefitRepository } from "./repository.js";

const bokjiroResponse = {
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

const subsidyResponse = {
  response: {
    body: {
      items: [
        {
          svcId: "GOV123456",
          svcNm: "부산 청년 월세 지원",
          jrsdDptNm: "부산광역시",
          svcPpo: "부산 거주 청년과 대학생에게 월세를 지원합니다.",
          supportTarget: "만 19세 이상 34세 이하 미취업 청년 1인 가구",
          applicationDueDate: "2026-10-15",
          serviceUseMethod: "정부24 온라인 신청",
          onlineUrl: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/GOV123456",
          requiredDocuments: "주민등록등본, 임대차계약서"
        }
      ]
    }
  }
};

const youthCenterResponse = {
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

describe("buildBenefitRepository", () => {
  it("uses fixtures only when no live API keys are configured", async () => {
    const fetch = vi.fn();
    const repository = buildBenefitRepository({ env: {}, fetch });

    await expect(repository.search()).resolves.toEqual(fixtureBenefits);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opts into cached 복지로 + 보조금24 live repositories with DATA_GO_KR_API_KEY and keeps fixtures as fallback", async () => {
    const fetch = vi.fn(async (url: URL | RequestInfo) => {
      const href = url.toString();
      if (href.includes("NationalWelfarelistV001")) {
        return new Response(JSON.stringify(bokjiroResponse), { status: 200 });
      }
      if (href.includes("T_OPD_PRMSCT_SBBGST")) {
        return new Response(JSON.stringify(subsidyResponse), { status: 200 });
      }
      throw new Error(`unexpected URL ${href}`);
    });
    let cacheNow = 1_000;

    const repository = buildBenefitRepository({
      env: { DATA_GO_KR_API_KEY: "data-go-key" },
      fetch,
      now: () => new Date("2026-06-09T00:00:00.000Z"),
      cacheNow: () => cacheNow
    });

    const first = await repository.search();
    const second = await repository.search();

    expect(first.map((record) => record.id)).toEqual(
      expect.arrayContaining(["bokjiro:WLF00004660", "subsidy24:GOV123456", fixtureBenefits[0].id])
    );
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);

    const requests = fetch.mock.calls.map(([url]) => url.toString());
    expect(requests).toEqual(expect.arrayContaining([expect.stringContaining("serviceKey=data-go-key")]));

    cacheNow += 10 * 60 * 1000 + 1;
    await repository.search();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("adds 온통청년 when YOUTH_CENTER_API_KEY is set and can exclude fixture fallback", async () => {
    const fetch = vi.fn(async (url: URL | RequestInfo) => {
      const href = url.toString();
      if (href.includes("NationalWelfarelistV001")) {
        return new Response(JSON.stringify(bokjiroResponse), { status: 200 });
      }
      if (href.includes("T_OPD_PRMSCT_SBBGST")) {
        return new Response(JSON.stringify(subsidyResponse), { status: 200 });
      }
      if (href.includes("youthPlcyList")) {
        return new Response(JSON.stringify(youthCenterResponse), { status: 200 });
      }
      throw new Error(`unexpected URL ${href}`);
    });

    const repository = buildBenefitRepository({
      env: {
        DATA_GO_KR_API_KEY: "data-go-key",
        YOUTH_CENTER_API_KEY: "youth-key",
        MCP_GEN_UI_FIXTURES: "off"
      },
      fetch,
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const ids = (await repository.search()).map((record) => record.id);

    expect(ids).toEqual(["bokjiro:WLF00004660", "subsidy24:GOV123456", "youth-center:R202506010001"]);
    expect(ids).not.toContain(fixtureBenefits[0].id);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps fixture results when a live adapter fails", async () => {
    const warn = vi.fn();
    const repository = buildBenefitRepository({
      env: { DATA_GO_KR_API_KEY: "data-go-key" },
      fetch: vi.fn(async () => new Response("Service unavailable", { status: 503 })),
      warn
    });

    const records = await repository.search();

    expect(records).toEqual(fixtureBenefits);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("503"));
  });
});
