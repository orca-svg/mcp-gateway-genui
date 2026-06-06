import { describe, expect, it } from "vitest";
import {
  BenefitSearchRequestSchema,
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
  });

  it("rejects an unknown age range", () => {
    expect(() => UserProfileSchema.parse({ ageRange: "centenarian" })).toThrow();
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

  it("requires a non-empty query", () => {
    expect(() => BenefitSearchRequestSchema.parse({ query: "" })).toThrow();
  });
});

describe("BenefitRecordSchema", () => {
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
