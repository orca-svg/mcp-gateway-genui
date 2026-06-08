import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureBenefitRepository } from "./repository.js";
import { SnapshotStore } from "./sqlite-store.js";
import { BenefitToolService } from "./tool-service.js";

describe("BenefitToolService", () => {
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
});
