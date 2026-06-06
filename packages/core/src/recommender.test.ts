import { describe, expect, it } from "vitest";
import { recommendBenefits } from "./recommender.js";
import { fixtureBenefits } from "./fixtures.js";

describe("recommendBenefits", () => {
  it("marks a matching benefit as a candidate with evidence", () => {
    const [top] = recommendBenefits(fixtureBenefits, {
      query: "서울 청년 월세 주거 지원",
      profile: {
        region: "서울",
        ageRange: "twenties",
        studentStatus: "unknown",
        employmentStatus: "unknown",
        householdType: "unknown",
        interests: ["housing"]
      }
    });

    expect(top?.id).toBe("seoul-youth-rent-support");
    expect(top?.status).toBe("candidate");
    expect(top?.reasons.length).toBeGreaterThan(0);
  });

  it("marks region-mismatched benefits as not applicable", () => {
    const results = recommendBenefits(fixtureBenefits, {
      query: "월세 지원",
      profile: {
        region: "부산",
        studentStatus: "unknown",
        employmentStatus: "unknown",
        householdType: "unknown",
        interests: []
      }
    });

    const seoul = results.find((r) => r.id === "seoul-youth-rent-support");
    expect(seoul?.status).toBe("not_applicable");
    expect(seoul?.reasons.join(" ")).toContain("부산");
  });

  it("requests more info when student status is unknown for a student-only benefit", () => {
    const results = recommendBenefits(fixtureBenefits, {
      query: "장학금",
      profile: {
        studentStatus: "unknown",
        employmentStatus: "unknown",
        householdType: "unknown",
        interests: ["education"]
      }
    });

    const scholarship = results.find((r) => r.id === "national-scholarship");
    expect(scholarship?.status).toBe("needs_more_info");
    expect(scholarship?.missingInfo).toContain("학생 여부 확인이 필요합니다.");
  });

  it("orders candidates ahead of needs_more_info and not_applicable", () => {
    const results = recommendBenefits(fixtureBenefits, {
      query: "서울 청년 주거",
      profile: {
        region: "서울",
        ageRange: "twenties",
        studentStatus: "student",
        employmentStatus: "unknown",
        householdType: "unknown",
        interests: ["housing"]
      }
    });

    const statuses = results.map((r) => r.status);
    const rank = { candidate: 0, needs_more_info: 1, not_applicable: 2 };
    const ranks = statuses.map((s) => rank[s]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
