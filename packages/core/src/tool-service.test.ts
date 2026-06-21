import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BenefitRecord } from "@mcp-gen-ui/schema";
import { kstDeadlineToUtc } from "./deadlines.js";
import { FixtureBenefitRepository } from "./repository.js";
import { SnapshotStore } from "./sqlite-store.js";
import { BenefitToolService } from "./tool-service.js";

describe("BenefitToolService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists injectable persona presets for host selection", async () => {
    const service = new BenefitToolService(new FixtureBenefitRepository(), undefined, {
      personas: {
        custom: {
          id: "custom",
          description: "Custom embedder persona",
          weights: {
            region: 1,
            age: 1,
            student: 1,
            employment: 1,
            household: 1,
            category: 2,
            query: 0
          }
        }
      }
    });

    await expect(service.listPersonas()).resolves.toEqual([
      {
        id: "custom",
        description: "Custom embedder persona",
        weights: {
          region: 1,
          age: 1,
          student: 1,
          employment: 1,
          household: 1,
          category: 2,
          query: 0
        }
      }
    ]);
  });

  it("scores upcoming deadlines without the synthetic query dimension", async () => {
    const service = new BenefitToolService(
      new FixtureBenefitRepository([deadlineBenefit("deadline", daysFromNow(5))])
    );

    const response = await service.getUpcomingDeadlines({ profile: {}, withinDays: 30 });

    expect(response.results[0]?.scoreBreakdown).toContainEqual(
      expect.objectContaining({ dimension: "query", weight: 0, contribution: 0 })
    );
  });

  it("groups fixture-backed benefit results by recommendation status", async () => {
    const service = new BenefitToolService(new FixtureBenefitRepository());

    const response = await service.searchBenefits({
      query: "서울 대학생 주거 지원",
      profile: {
        region: "서울",
        ageRange: "twenties",
        studentStatus: "student",
        interests: ["housing", "education"]
      }
    });

    expect(response.results[0]?.status).toBe("candidate");
    expect(response.results[0]?.score).toBeGreaterThan(0);
    expect(response.results[0]?.scoreBreakdown.length).toBeGreaterThan(0);
    expect(response.results.map((result) => result.id)).toContain(
      "seoul-youth-rent-support"
    );
  });

  it("throws an explicit error for an unknown benefit id", async () => {
    const service = new BenefitToolService(new FixtureBenefitRepository());
    await expect(service.getBenefitDetail("does-not-exist")).rejects.toThrow(
      /Benefit not found/
    );
  });

  it("builds a checklist with a non-eligibility caveat", async () => {
    const service = new BenefitToolService(new FixtureBenefitRepository());
    const checklist = await service.buildChecklist("seoul-youth-rent-support");

    expect(checklist.items.length).toBeGreaterThan(0);
    expect(checklist.caveats[0]).toContain("확정 자격 판정이 아니");
  });

  it("returns user-action-only application guidance", async () => {
    const service = new BenefitToolService(new FixtureBenefitRepository());
    const guide = await service.getApplicationGuide("national-scholarship");

    expect(guide.steps).toHaveLength(3);
    expect(guide.steps.every((step) => step.requiresUserAction)).toBe(true);
    expect(guide.safetyNotice).toContain("대신 수행하지 않습니다");
  });

  it("records SQLite change logs while serving tool calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-gen-ui-gateway-"));
    const store = new SnapshotStore(join(dir, "test.db"));
    const service = new BenefitToolService(new FixtureBenefitRepository(), store);

    await service.searchBenefits({
      query: "장학금",
      profile: { studentStatus: "student" }
    });
    const log = await service.getChangeLog();

    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.every((entry) => entry.entityType === "benefit")).toBe(true);
    store.close();
  });

  it("classifies repeated snapshots of identical data as unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-gen-ui-gateway-"));
    const store = new SnapshotStore(join(dir, "test.db"));
    const service = new BenefitToolService(new FixtureBenefitRepository(), store);

    await service.searchBenefits({ query: "장학금", profile: {} });
    await service.searchBenefits({ query: "장학금", profile: {} });
    const log = await service.getChangeLog("national-scholarship");

    expect(log.entries.some((entry) => entry.changeType === "created")).toBe(true);
    expect(log.entries.some((entry) => entry.changeType === "unchanged")).toBe(true);
    store.close();
  });

  it("returns applicable deadline-bearing benefits sorted by deadline and filtered by window", async () => {
    const soon = daysFromNow(5);
    const later = daysFromNow(20);
    const outsideWindow = daysFromNow(45);
    const benefits = [
      deadlineBenefit("later-seoul", later, { regionTags: ["서울"] }),
      deadlineBenefit("soon-seoul", soon, { regionTags: ["서울"] }),
      deadlineBenefit("outside-window", outsideWindow, { regionTags: ["서울"] }),
      deadlineBenefit("busan-only", daysFromNow(3), { regionTags: ["부산"] }),
      deadlineBenefit("no-deadline", undefined, { regionTags: ["서울"] })
    ];
    const service = new BenefitToolService(new FixtureBenefitRepository(benefits));

    const response = await service.getUpcomingDeadlines({
      profile: { region: "서울" },
      withinDays: 30
    });

    expect(response.withinDays).toBe(30);
    expect(response.results.map((benefit) => benefit.id)).toEqual([
      "soon-seoul",
      "later-seoul"
    ]);
    expect(response.results.map((benefit) => benefit.applicationDeadline)).toEqual([
      soon,
      later
    ]);
    expect(response.results.every((benefit) => benefit.status !== "not_applicable")).toBe(
      true
    );
    expect(
      response.results.every((benefit) => benefit.scoreBreakdown.length > 0)
    ).toBe(true);
  });

  it("keeps KST-authored deadlines inside the window through the end of the KST day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T14:59:59.000Z"));
    const kstDeadline = kstDeadlineToUtc("2026-07-15");
    const benefits = [deadlineBenefit("kst-deadline", kstDeadline, { regionTags: ["서울"] })];
    const service = new BenefitToolService(new FixtureBenefitRepository(benefits));

    const response = await service.getUpcomingDeadlines({
      profile: { region: "서울" },
      withinDays: 1
    });

    expect(response.results.map((benefit) => benefit.id)).toEqual(["kst-deadline"]);
    expect(response.results[0]?.applicationDeadline).toBe("2026-07-15T14:59:59.000Z");
  });
});

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(9, 0, 0, 0);
  return date.toISOString();
}

function deadlineBenefit(
  id: string,
  applicationDeadline?: string,
  overrides: Partial<BenefitRecord> = {}
): BenefitRecord {
  return {
    id,
    title: `Benefit ${id}`,
    provider: "Provider",
    category: "other",
    summary: `Summary for ${id}`,
    target: "Target",
    eligibility: [],
    applicationPeriod: "공고별 상이",
    applicationDeadline,
    documents: [],
    applicationMethods: ["온라인 신청"],
    sourceUrl: `https://example.com/${id}`,
    lastFetchedAt: "2026-05-20T00:00:00.000Z",
    evidence: [],
    searchableText: id,
    regionTags: [],
    ageRanges: [],
    studentOnly: false,
    employmentStatuses: [],
    householdTypes: [],
    ...overrides
  };
}
