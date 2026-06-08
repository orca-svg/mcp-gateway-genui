import { describe, expect, it } from "vitest";
import {
  BenefitSearchRequestSchema,
  BenefitSummarySchema,
  BenefitRecordSchema,
  UserProfileSchema
} from "./index.js";

describe("UserProfileSchema", () => {
  it("applies non-identifying defaults", () => {
    const profile = UserProfileSchema.parse({});

    expect(profile.studentStatus).toBe("unknown");
    expect(profile.employmentStatus).toBe("unknown");
    expect(profile.householdType).toBe("unknown");
    expect(profile.interests).toEqual([]);
    expect(profile.persona).toBeUndefined();
  });

  it("rejects an unknown age range", () => {
    expect(() => UserProfileSchema.parse({ ageRange: "centenarian" })).toThrow();
  });
});

describe("BenefitSummarySchema", () => {
  it("defaults recommendation scores for backward compatibility", () => {
    const summary = BenefitSummarySchema.parse({
      id: "x",
      title: "x",
      provider: "x",
      category: "other",
      summary: "x",
      status: "candidate"
    });

    expect(summary.score).toBe(0);
    expect(summary.scoreBreakdown).toEqual([]);
  });
});

describe("BenefitSearchRequestSchema", () => {
  it("parses non-identifying profile conditions", () => {
    const parsed = BenefitSearchRequestSchema.parse({
      query: "서울 거주 대학생 지원",
      profile: {
        region: "서울",
        ageRange: "twenties",
        studentStatus: "student",
        interests: ["education"]
      }
    });

    expect(parsed.profile.studentStatus).toBe("student");
    expect(parsed.profile.employmentStatus).toBe("unknown");
  });

  it("accepts persona and per-request score weight overrides", () => {
    const parsed = BenefitSearchRequestSchema.parse({
      query: "서울 청년 월세",
      profile: { persona: "housing", interests: ["housing"] },
      weights: { region: 3, category: 2, household: 1 }
    });

    expect(parsed.profile.persona).toBe("housing");
    expect(parsed.weights.region).toBe(3);
  });

  it("requires a non-empty query", () => {
    expect(() => BenefitSearchRequestSchema.parse({ query: "" })).toThrow();
  });
});

describe("BenefitRecordSchema", () => {
  it("defaults household type tags for repository records", () => {
    const record = BenefitRecordSchema.parse({
      id: "x",
      title: "x",
      provider: "x",
      category: "other",
      summary: "x",
      target: "x",
      sourceUrl: "https://example.com/x",
      lastFetchedAt: "2026-05-20T00:00:00.000Z"
    });

    expect(record.householdTypes).toEqual([]);
  });

  it("requires a valid source URL", () => {
    expect(() =>
      BenefitRecordSchema.parse({
        id: "x",
        title: "x",
        provider: "x",
        category: "other",
        summary: "x",
        target: "x",
        sourceUrl: "not-a-url",
        lastFetchedAt: "2026-05-20T00:00:00.000Z"
      })
    ).toThrow();
  });
});
