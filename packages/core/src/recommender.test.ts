import { describe, expect, it } from "vitest";
import { defaultPersonaRegistry, recommendBenefits, resolveWeights } from "./recommender.js";
import { fixtureBenefits } from "./fixtures.js";

describe("recommendBenefits", () => {
  it("resolves general as uniform weights and merges overrides on top of presets", () => {
    expect(resolveWeights("general", {})).toEqual({
      region: 1,
      age: 1,
      student: 1,
      employment: 1,
      household: 1,
      category: 1,
      query: 1
    });

    expect(resolveWeights("university_student", { query: 0 })).toEqual({
      ...defaultPersonaRegistry.university_student.weights,
      query: 0
    });
  });

  it("uses request overrides as a merge instead of narrowing the score plan", () => {
    const [result] = recommendBenefits(
      [
        {
          ...fixtureBenefits[0]!,
          regionTags: ["서울"],
          ageRanges: ["twenties"],
          studentOnly: false,
          employmentStatuses: []
        }
      ],
      {
        query: "무관한검색어",
        profile: {
          region: "서울",
          studentStatus: "unknown",
          employmentStatus: "unknown",
          householdType: "unknown",
          interests: []
        },
        weights: { region: 2, age: 2 }
      }
    );

    expect(result?.scoreBreakdown.map((item) => item.dimension)).toEqual([
      "region",
      "age",
      "student",
      "employment",
      "household",
      "category",
      "query"
    ]);
    expect(result?.score).toBe(0.667);
  });

  it("keeps hard blockers ahead of score weighting", () => {
    const [result] = recommendBenefits(
      [
        {
          ...fixtureBenefits[0]!,
          id: "seoul-only",
          regionTags: ["서울"],
          searchableText: "부산 관심사와 매우 강한 검색 일치"
        }
      ],
      {
        query: "부산 관심사 검색",
        profile: {
          region: "부산",
          studentStatus: "unknown",
          employmentStatus: "unknown",
          householdType: "unknown",
          interests: ["housing"]
        },
        weights: { query: 100, category: 100, region: 1 }
      }
    );

    expect(result?.status).toBe("not_applicable");
    expect(result?.score).toBeLessThan(1);
  });

  it("normalizes weighted score math and gives missing inputs partial credit", () => {
    const [result] = recommendBenefits(
      [
        {
          ...fixtureBenefits[0]!,
          regionTags: ["서울"],
          ageRanges: ["twenties"],
          studentOnly: false,
          employmentStatuses: []
        }
      ],
      {
        query: "무관한검색어",
        profile: {
          region: "서울",
          studentStatus: "unknown",
          employmentStatus: "unknown",
          householdType: "unknown",
          interests: []
        },
        weights: { region: 2, age: 2 }
      }
    );

    expect(result?.score).toBe(0.667);
    expect(result?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: "region", signal: 1, weight: 2 }),
        expect.objectContaining({ dimension: "age", signal: 0.5, weight: 2 })
      ])
    );
  });

  it("uses household type matching as a scoring and evidence dimension", () => {
    const [result] = recommendBenefits(
      [
        {
          ...fixtureBenefits[0]!,
          householdTypes: ["single"],
          regionTags: [],
          ageRanges: [],
          employmentStatuses: []
        }
      ],
      {
        query: "월세",
        profile: {
          studentStatus: "unknown",
          employmentStatus: "unknown",
          householdType: "single",
          interests: []
        },
        weights: { household: 3 }
      }
    );

    expect(result?.scoreBreakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ dimension: "household", signal: 1 })])
    );
    expect(result?.reasons).toContain("가구 유형 조건과 일치합니다.");
  });

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

  it("orders results by status, score descending, then reasons", () => {
    const results = recommendBenefits(
      [
        { ...fixtureBenefits[0]!, id: "low", title: "나중", category: "other", searchableText: "" },
        { ...fixtureBenefits[0]!, id: "high", title: "먼저", category: "housing", searchableText: "월세" }
      ],
      {
        query: "월세",
        profile: {
          region: "서울",
          ageRange: "twenties",
          studentStatus: "unknown",
          employmentStatus: "unknown",
          householdType: "unknown",
          interests: ["housing"]
        },
        weights: { category: 5, query: 5 }
      }
    );

    expect(results.map((result) => result.id)).toEqual(["high", "low"]);
  });
});
