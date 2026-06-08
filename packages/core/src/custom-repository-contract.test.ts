import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BenefitRecord } from "@mcp-gen-ui/schema";
import { describe, expect, it } from "vitest";
import type { BenefitRepository } from "./repository.js";
import { SnapshotStore } from "./sqlite-store.js";
import { BenefitToolService } from "./tool-service.js";

const arbitraryBenefit: BenefitRecord = {
  id: "busan-caregiver-training",
  title: "부산 돌봄 교육 바우처",
  provider: "부산광역시",
  category: "employment",
  summary: "돌봄 분야 재취업 준비자를 위한 교육비 지원입니다.",
  target: "부산 거주 미취업 구직자 중 돌봄 직무 교육 참여 희망자",
  eligibility: ["부산 거주", "미취업", "교육 참여 의사 확인"],
  applicationPeriod: "분기별 모집",
  applicationDeadline: "2030-08-01T09:00:00.000Z",
  fee: "없음",
  processingTime: "접수 후 14일 이내",
  documents: [
    {
      id: "residence-confirmation",
      label: "부산 거주 확인 서류",
      required: true,
      source: "program"
    },
    {
      id: "job-seeker-registration",
      label: "구직 등록 확인서",
      required: true,
      source: "program"
    }
  ],
  applicationMethods: ["온라인 신청", "교육기관 방문 상담"],
  applicationUrl: "https://www.busan.go.kr/",
  sourceUrl: "https://www.busan.go.kr/",
  lastFetchedAt: "2026-06-01T00:00:00.000Z",
  evidence: [],
  searchableText: "부산 돌봄 교육 바우처 재취업 구직 직무 훈련",
  regionTags: ["부산"],
  ageRanges: ["thirties", "forties", "fifties"],
  studentOnly: false,
  employmentStatuses: ["unemployed"]
};

class AsyncMapBenefitRepository implements BenefitRepository {
  private readonly benefits = new Map<string, BenefitRecord>([
    [arbitraryBenefit.id, arbitraryBenefit]
  ]);

  async search(): Promise<BenefitRecord[]> {
    await Promise.resolve();
    return [...this.benefits.values()];
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    await Promise.resolve();
    return this.benefits.get(id);
  }
}

describe("custom BenefitRepository extension contract", () => {
  it("serves all tools through an asynchronous custom repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-gen-ui-custom-repo-"));
    const store = new SnapshotStore(join(dir, "test.db"));
    const service = new BenefitToolService(new AsyncMapBenefitRepository(), store);

    const search = await service.searchBenefits({
      query: "부산 돌봄 교육",
      profile: {
        region: "부산",
        ageRange: "forties",
        employmentStatus: "unemployed",
        interests: ["employment"]
      }
    });
    const detail = await service.getBenefitDetail(arbitraryBenefit.id);
    const deadlines = await service.getUpcomingDeadlines({
      profile: {
        region: "부산",
        ageRange: "forties",
        employmentStatus: "unemployed",
        interests: ["employment"]
      }
    });
    const checklist = await service.buildChecklist(arbitraryBenefit.id);
    const guide = await service.getApplicationGuide(arbitraryBenefit.id);
    const changeLog = await service.getChangeLog(arbitraryBenefit.id);

    expect(search.results).toHaveLength(1);
    expect(search.results[0]).toMatchObject({
      id: arbitraryBenefit.id,
      status: "candidate",
      title: arbitraryBenefit.title
    });
    expect(search.results[0]?.reasons).toContain("부산 지역 조건과 일치합니다.");
    expect(detail.title).toBe(arbitraryBenefit.title);
    expect(deadlines.results.map((result) => result.id)).toEqual([arbitraryBenefit.id]);
    expect(checklist.items.map((item) => item.id)).toEqual([
      "residence-confirmation",
      "job-seeker-registration"
    ]);
    expect(checklist.caveats[0]).toContain("확정 자격 판정");
    expect(guide.steps.every((step) => step.requiresUserAction)).toBe(true);
    expect(guide.safetyNotice).toContain("대신 수행하지 않습니다");
    expect(changeLog.entries.some((entry) => entry.changeType === "created")).toBe(
      true
    );

    store.close();
  });

  it("ships extension documentation and an example custom repository", () => {
    const repoRoot = resolve("../..");

    expect(existsSync(resolve(repoRoot, "examples/custom-benefit-repository.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(repoRoot, "docs/extending.md"))).toBe(true);
  });
});
