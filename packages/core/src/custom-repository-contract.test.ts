import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BenefitRepositoryDetailResultSchema,
  BenefitRepositoryResultSchema,
  DataStatusSchema,
  type BenefitRecord,
  type BenefitRepositoryDetailResult,
  type BenefitRepositoryResult,
  type DataStatus
} from "@mcp-gen-ui/schema";
import { describe, expect, it } from "vitest";
import { fixtureBenefits } from "./fixtures.js";
import type { BenefitRepository } from "./repository.js";
import { dataStatusFromObservations } from "./repository.js";
import {
  BenefitToolService,
  NON_ELIGIBILITY_DISCLAIMER
} from "./tool-service.js";

const NOW = "2026-07-10T00:00:00.000Z";
const CUSTOM_SOURCE_ID = "custom-json-source";
const arbitraryBenefit = fixtureBenefits[0]!;

class AsyncMapBenefitRepository implements BenefitRepository {
  readonly mode = "live" as const;
  private readonly benefits = new Map<string, BenefitRecord>([
    [arbitraryBenefit.id, arbitraryBenefit]
  ]);

  async search(): Promise<BenefitRepositoryResult> {
    await Promise.resolve();
    const records = [...this.benefits.values()];
    return BenefitRepositoryResultSchema.parse({
      records,
      dataStatus: this.dataStatus(records.length)
    });
  }

  async getById(id: string): Promise<BenefitRepositoryDetailResult> {
    await Promise.resolve();
    const record = this.benefits.get(id);
    return BenefitRepositoryDetailResultSchema.parse({
      record,
      dataStatus: this.dataStatus(record ? 1 : 0)
    });
  }

  private dataStatus(recordCount: number): DataStatus {
    return DataStatusSchema.parse({
      mode: this.mode,
      partial: false,
      sources: [
        {
          sourceId: CUSTOM_SOURCE_ID,
          status: "ok",
          retrievedAt: NOW,
          recordCount,
          adapterVersion: "custom-repository-2"
        }
      ]
    });
  }
}

describe("custom BenefitRepository v2 extension contract", () => {
  it("marks an all-source failure as partial while preserving every observation", () => {
    const dataStatus = dataStatusFromObservations("live", [
      {
        sourceId: "source-a",
        status: "timeout",
        retrievedAt: NOW,
        recordCount: 0,
        errorCode: "timeout",
        adapterVersion: "1.0.0"
      },
      {
        sourceId: "source-b",
        status: "unavailable",
        retrievedAt: NOW,
        recordCount: 0,
        errorCode: "unavailable",
        adapterVersion: "1.0.0"
      }
    ]);

    expect(dataStatus).toMatchObject({
      mode: "live",
      partial: true,
      sources: [{ status: "timeout" }, { status: "unavailable" }]
    });
  });

  it("returns source-aware search/detail results from a readonly repository mode", async () => {
    const repository = new AsyncMapBenefitRepository();

    expect(repository.mode).toBe("live");
    await expect(repository.search()).resolves.toMatchObject({
      records: [expect.objectContaining({ id: arbitraryBenefit.id })],
      dataStatus: {
        mode: "live",
        partial: false,
        sources: [
          expect.objectContaining({
            sourceId: CUSTOM_SOURCE_ID,
            status: "ok",
            recordCount: 1
          })
        ]
      }
    });
    await expect(repository.getById("missing-benefit")).resolves.toMatchObject({
      dataStatus: {
        mode: "live",
        sources: [expect.objectContaining({ recordCount: 0 })]
      }
    });
  });

  it("serves every benefit read flow through the asynchronous custom repository", async () => {
    const service = new BenefitToolService(new AsyncMapBenefitRepository(), undefined, {
      now: () => new Date(NOW),
      gatewayVersion: "custom-gateway-2"
    });
    const profile = {
      regionCode: "KR-11" as const,
      ageBand: "twenties" as const,
      studentStatus: "not_student" as const,
      employmentStatus: "unemployed" as const,
      householdType: "single" as const,
      interests: ["housing" as const]
    };

    const search = await service.searchBenefits({ query: "서울 청년 월세", profile });
    const detail = await service.getBenefitDetail({ id: arbitraryBenefit.id });
    const deadlines = await service.getUpcomingDeadlines({ profile });
    const checklist = await service.buildChecklist({ benefitId: arbitraryBenefit.id });
    const guide = await service.getApplicationGuide({ benefitId: arbitraryBenefit.id });

    expect(search).toMatchObject({
      schemaVersion: "benefit-search.v2",
      dataStatus: {
        mode: "live",
        sources: [expect.objectContaining({ sourceId: CUSTOM_SOURCE_ID })]
      },
      results: [
        expect.objectContaining({
          id: arbitraryBenefit.id,
          assessment: expect.objectContaining({ status: "candidate" }),
          provenance: arbitraryBenefit.provenance,
          links: arbitraryBenefit.links
        })
      ]
    });
    expect(detail.result).toMatchObject({
      id: arbitraryBenefit.id,
      provenance: arbitraryBenefit.provenance,
      links: arbitraryBenefit.links
    });
    expect(deadlines.results.map((result) => result.id)).toEqual([
      arbitraryBenefit.id
    ]);
    expect(checklist).toMatchObject({
      items: arbitraryBenefit.documents,
      caveats: [NON_ELIGIBILITY_DISCLAIMER],
      provenance: arbitraryBenefit.provenance,
      links: arbitraryBenefit.links
    });
    expect(guide.steps.every((step) => step.requiresUserAction)).toBe(true);
  });

  it("ships a source-aware v2 JSON-file repository example", () => {
    const repoRoot = resolve("../..");
    const examplePath = resolve(repoRoot, "examples/custom-benefit-repository.ts");

    expect(existsSync(examplePath)).toBe(true);
    const example = readFileSync(examplePath, "utf8");
    expect(example).toContain("readonly mode");
    expect(example).toContain("BenefitRepositoryResultSchema");
    expect(example).toContain("BenefitRepositoryDetailResultSchema");
    expect(example).toContain("dataStatus");
  });
});
