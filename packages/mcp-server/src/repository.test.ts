import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GatewayError, fixtureBenefits } from "@mcp-gen-ui/core";
import { buildBenefitRepository, type RuntimeEnvironment } from "./repository.js";

const FIXED_NOW = new Date("2026-07-10T00:00:00.000Z");
const now = () => FIXED_NOW;
const cacheNow = () => FIXED_NOW.getTime();
const YOUTH_CENTER_ORIGIN = "https://www.youthcenter.go.kr";
const DATA_GO_KR_ORIGIN = "https://apis.data.go.kr";
const OFFICIAL_ENDPOINTS = {
  "youth-center": `${YOUTH_CENTER_ORIGIN}/go/ythip/getPlcy`,
  bokjiro: `${DATA_GO_KR_ORIGIN}/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001`,
  subsidy24: `${DATA_GO_KR_ORIGIN}/1051000/MoefOpenAPI2025/T_OPD_ASBS_PBNS_UNITY`
} as const;
const fixtureUrl = (name: string) =>
  new URL(`../../adapters/src/fixtures/${name}`, import.meta.url);

const youthCenterPayload = readFileSync(
  fixtureUrl("youth-center-list.json"),
  "utf8"
);
const bokjiroPayload = readFileSync(
  fixtureUrl("bokjiro-wanted-list-success.xml"),
  "utf8"
);
const subsidyPayload = readFileSync(
  fixtureUrl("subsidy-open-calls.json"),
  "utf8"
);

function responseFor(input: Parameters<typeof globalThis.fetch>[0]): Response {
  const url = new URL(String(input));
  switch (sourceFor(url)) {
    case "youth-center":
      return new Response(youthCenterPayload, {
        headers: { "Content-Type": "application/json" }
      });
    case "bokjiro":
      return new Response(bokjiroPayload, {
        headers: { "Content-Type": "application/xml" }
      });
    case "subsidy24":
      return new Response(subsidyPayload, {
        headers: { "Content-Type": "application/json" }
      });
  }
}

function sourceFor(url: URL): "youth-center" | "bokjiro" | "subsidy24" {
  if (url.origin === YOUTH_CENTER_ORIGIN && url.pathname.includes("/go/ythip/getPlcy")) {
    return "youth-center";
  }
  if (url.origin === DATA_GO_KR_ORIGIN && url.pathname.includes("NationalWelfare")) {
    return "bokjiro";
  }
  if (url.origin === DATA_GO_KR_ORIGIN && url.pathname.includes("MoefOpenAPI2025")) {
    return "subsidy24";
  }
  throw new Error("Unexpected adapter endpoint in test.");
}

function apiKeyForRequest(url: URL): string | null {
  return url.searchParams.get(
    sourceFor(url) === "youth-center" ? "apiKeyNm" : "serviceKey"
  );
}

function injectedFetch(
  implementation: (
    input: Parameters<typeof globalThis.fetch>[0]
  ) => Response | Promise<Response> = responseFor
) {
  return vi.fn(implementation) as unknown as typeof globalThis.fetch;
}

describe("buildBenefitRepository", () => {
  it.each(["development", "test"])(
    "defaults NODE_ENV=%s to fixture mode with explicit fixture status",
    async (nodeEnv) => {
      const fetch = injectedFetch();
      const repository = buildBenefitRepository({
        env: { NODE_ENV: nodeEnv },
        fetch,
        now
      });

      const result = await repository.search();

      expect(result.records).toEqual(fixtureBenefits);
      expect(result.dataStatus).toEqual({
        mode: "fixture",
        partial: false,
        sources: [
          {
            sourceId: "fixture-benefits",
            status: "ok",
            retrievedAt: FIXED_NOW.toISOString(),
            recordCount: fixtureBenefits.length,
            adapterVersion: "2.0.0-fixture"
          }
        ]
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("rejects an implicit production repository mode", () => {
    const fetch = injectedFetch();

    expect(() =>
      buildBenefitRepository({
        env: { NODE_ENV: "production" },
        fetch,
        now
      })
    ).toThrowError(expect.objectContaining<Partial<GatewayError>>({
      name: "GatewayError",
      code: "configuration_error"
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each<{
    label: string;
    env: RuntimeEnvironment;
  }>([
    {
      label: "invalid mode",
      env: { MCP_GEN_UI_REPOSITORY_MODE: "automatic" }
    },
    {
      label: "unknown source",
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "unknown-source",
        DATA_GO_KR_API_KEY: "shared-key"
      }
    },
    {
      label: "unknown endpoint origin",
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "bokjiro",
        BOKJIRO_API_KEY: "bokjiro-key",
        BOKJIRO_API_ENDPOINT: "https://unknown.example.test/bokjiro"
      }
    },
    {
      label: "legacy data.go.kr endpoint for youth-center",
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "youth-center",
        YOUTH_CENTER_API_KEY: "youth-key",
        YOUTH_CENTER_API_ENDPOINT:
          "https://apis.data.go.kr/1051000/youthPlcyList/getYouthPlcyList"
      }
    },
    {
      label: "unknown endpoint origin for youth-center",
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "youth-center",
        YOUTH_CENTER_API_KEY: "youth-key",
        YOUTH_CENTER_API_ENDPOINT: "https://unknown.example.test/go/ythip/getPlcy"
      }
    },
    {
      label: "missing required source key",
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "youth-center",
        DATA_GO_KR_API_KEY: "shared-key-does-not-authorize-youth"
      }
    }
  ])("rejects $label before fetching", ({ env }) => {
    const fetch = injectedFetch();

    expect(() => buildBenefitRepository({ env, fetch, now })).toThrowError(
      expect.objectContaining<Partial<GatewayError>>({
        name: "GatewayError",
        code: "configuration_error"
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses only the requested live adapter without a fixture fallback", async () => {
    const fetch = injectedFetch();
    const repository = buildBenefitRepository({
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "bokjiro",
        BOKJIRO_API_KEY: "bokjiro-key"
      },
      fetch,
      now,
      cacheNow,
      logger: { warn: vi.fn() }
    });

    const result = await repository.search();

    expect(result.dataStatus).toMatchObject({
      mode: "live",
      partial: false,
      sources: [{ sourceId: "bokjiro", status: "ok" }]
    });
    expect(result.dataStatus.sources).toHaveLength(1);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.every((record) => record.sourceId === "bokjiro")).toBe(true);
    expect(result.records.some((record) => record.id === fixtureBenefits[0]?.id)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains fixture records and reports a failed live source as partial in mixed mode", async () => {
    const fetch = injectedFetch(async () => new Response("upstream failed", { status: 500 }));
    const warn = vi.fn();
    const repository = buildBenefitRepository({
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "mixed",
        MCP_GEN_UI_LIVE_SOURCES: "bokjiro",
        BOKJIRO_API_KEY: "bokjiro-key"
      },
      fetch,
      now,
      cacheNow,
      logger: { warn }
    });

    const result = await repository.search();

    expect(result.records).toEqual(fixtureBenefits);
    expect(result.dataStatus).toMatchObject({
      mode: "mixed",
      partial: true,
      sources: [
        {
          sourceId: "fixture-benefits",
          status: "ok",
          recordCount: fixtureBenefits.length
        },
        {
          sourceId: "bokjiro",
          status: "unavailable",
          recordCount: 0
        }
      ]
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("bokjiro:http_error");
  });

  it("uses the shared key for bokjiro and subsidy24, but never infers youth-center", async () => {
    const fetch = injectedFetch();
    const repository = buildBenefitRepository({
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        DATA_GO_KR_API_KEY: "shared-key"
      },
      fetch,
      now,
      cacheNow,
      logger: { warn: vi.fn() }
    });

    const result = await repository.search();
    const requestedUrls = vi.mocked(fetch).mock.calls.map(([input]) =>
      new URL(String(input))
    );

    expect(result.dataStatus.sources.map((source) => source.sourceId)).toEqual([
      "bokjiro",
      "subsidy24"
    ]);
    expect(requestedUrls.map(sourceFor)).toEqual(["bokjiro", "subsidy24"]);
    expect(requestedUrls.every((url) => url.searchParams.get("serviceKey") === "shared-key"))
      .toBe(true);
    expect(requestedUrls.some((url) => sourceFor(url) === "youth-center")).toBe(false);
  });

  it("prefers each source-specific key over the shared key", async () => {
    const fetch = injectedFetch();
    const repository = buildBenefitRepository({
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "youth-center,bokjiro,subsidy24",
        DATA_GO_KR_API_KEY: "shared-key",
        YOUTH_CENTER_API_KEY: "youth-key",
        BOKJIRO_API_KEY: "bokjiro-key",
        SUBSIDY24_API_KEY: "subsidy-key",
        YOUTH_CENTER_API_ENDPOINT: OFFICIAL_ENDPOINTS["youth-center"],
        BOKJIRO_API_ENDPOINT: OFFICIAL_ENDPOINTS.bokjiro,
        SUBSIDY24_API_ENDPOINT: OFFICIAL_ENDPOINTS.subsidy24
      },
      fetch,
      now,
      cacheNow,
      logger: { warn: vi.fn() }
    });

    await repository.search();
    const keysBySource = Object.fromEntries(
      vi.mocked(fetch).mock.calls.map(([input]) => {
        const url = new URL(String(input));
        return [sourceFor(url), apiKeyForRequest(url)];
      })
    );
    const originsBySource = Object.fromEntries(
      vi.mocked(fetch).mock.calls.map(([input]) => {
        const url = new URL(String(input));
        return [sourceFor(url), url.origin];
      })
    );

    expect(keysBySource).toEqual({
      "youth-center": "youth-key",
      bokjiro: "bokjiro-key",
      subsidy24: "subsidy-key"
    });
    expect(originsBySource).toEqual({
      "youth-center": YOUTH_CENTER_ORIGIN,
      bokjiro: DATA_GO_KR_ORIGIN,
      subsidy24: DATA_GO_KR_ORIGIN
    });
  });

  it("serves repeated searches from the repository cache", async () => {
    const fetch = injectedFetch();
    const repository = buildBenefitRepository({
      env: {
        MCP_GEN_UI_REPOSITORY_MODE: "live",
        MCP_GEN_UI_LIVE_SOURCES: "bokjiro",
        MCP_GEN_UI_CACHE_TTL_MS: "1000",
        BOKJIRO_API_KEY: "bokjiro-key"
      },
      fetch,
      now,
      cacheNow,
      logger: { warn: vi.fn() }
    });

    const first = await repository.search();
    const second = await repository.search();

    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
