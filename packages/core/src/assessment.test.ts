import type {
  BenefitRecord,
  StrictCoarseProfile
} from "@mcp-gen-ui/schema";
import { describe, expect, it } from "vitest";
import { assessBenefit } from "./assessment.js";
import { fixtureBenefits } from "./fixtures.js";

const base = fixtureBenefits[0]!;

const matchingProfile: StrictCoarseProfile = {
  regionCode: "KR-11",
  ageBand: "twenties",
  studentStatus: "not_student",
  employmentStatus: "employed",
  householdType: "single",
  interests: []
};

describe("assessBenefit", () => {
  it("returns a candidate only when authoritative structured conditions match", () => {
    const assessment = assessBenefit(base, matchingProfile);

    expect(assessment.status).toBe("candidate");
    expect(assessment.constraints.every((constraint) => constraint.outcome === "match")).toBe(
      true
    );
    expect(assessment.missingInfo).toEqual([]);
  });

  it("turns missing profile values into unknown and needs_more_info", () => {
    const assessment = assessBenefit(base, {
      studentStatus: "unknown",
      employmentStatus: "unknown",
      householdType: "unknown",
      interests: []
    });

    expect(assessment.status).toBe("needs_more_info");
    expect(assessment.constraints.some((constraint) => constraint.outcome === "unknown")).toBe(
      true
    );
    expect(assessment.missingInfo.length).toBeGreaterThan(0);
  });

  it("does not infer a hard age conflict from a title containing 청년", () => {
    const titleOnly: BenefitRecord = {
      ...base,
      title: "청년 전용처럼 보이는 자유 텍스트 제목",
      constraints: base.constraints.filter((rule) => rule.dimension !== "age")
    };
    const assessment = assessBenefit(titleOnly, {
      ...matchingProfile,
      ageBand: "forties"
    });
    const age = assessment.constraints.find((constraint) => constraint.dimension === "age");

    expect(age).toMatchObject({ outcome: "unknown", basis: "default" });
    expect(assessment.status).toBe("needs_more_info");
    expect(assessment.constraints.some((constraint) => constraint.outcome === "conflict")).toBe(
      false
    );
  });

  it("keeps derived and default mismatches unknown even when profile data exists", () => {
    const derived: BenefitRecord = {
      ...base,
      constraints: base.constraints.map((rule) =>
        rule.dimension === "age"
          ? {
              ...rule,
              basis: "derived_text" as const,
              allowedValues: ["twenties"]
            }
          : rule
      )
    };
    const assessment = assessBenefit(derived, {
      ...matchingProfile,
      ageBand: "forties"
    });
    const age = assessment.constraints.find((constraint) => constraint.dimension === "age");

    expect(age).toMatchObject({ outcome: "unknown", basis: "derived_text" });
    expect(assessment.status).toBe("needs_more_info");
  });

  it("creates conflict_detected only for an authoritative mismatch", () => {
    const assessment = assessBenefit(base, {
      ...matchingProfile,
      regionCode: "KR-26"
    });

    expect(assessment.status).toBe("conflict_detected");
    expect(assessment.constraints).toContainEqual(
      expect.objectContaining({
        dimension: "region",
        outcome: "conflict",
        basis: "authoritative_structured"
      })
    );
  });

  it("emits complete rule metadata on every constraint", () => {
    const assessment = assessBenefit(base, matchingProfile);

    for (const constraint of assessment.constraints) {
      expect(constraint).toEqual(
        expect.objectContaining({
          dimension: expect.any(String),
          outcome: expect.any(String),
          basis: expect.any(String),
          ruleId: expect.any(String),
          ruleVersion: expect.any(String),
          sourceFields: expect.any(Array),
          explanation: expect.any(String)
        })
      );
    }
  });
});
