import type {
  BenefitRecord,
  BenefitRule,
  BenefitSearchRequest
} from "@mcp-gen-ui/schema";
import { BenefitRecordSchema } from "@mcp-gen-ui/schema";
import { describe, expect, it } from "vitest";
import { fixtureBenefits } from "./fixtures.js";
import {
  defaultPersonaRegistry,
  recommendBenefits,
  resolveWeights
} from "./recommender.js";

const completeProfile = {
  regionCode: "KR-11" as const,
  ageBand: "twenties" as const,
  studentStatus: "not_student" as const,
  employmentStatus: "employed" as const,
  householdType: "single" as const,
  interests: ["housing" as const]
};

function request(
  overrides: Partial<BenefitSearchRequest> = {}
): BenefitSearchRequest {
  return {
    query: "서울 월세 지원",
    profile: completeProfile,
    weights: {},
    ...overrides
  };
}

describe("recommendBenefits v2", () => {
  it("ships records that satisfy the strict v2 internal contract", () => {
    expect(
      fixtureBenefits.every((record) => BenefitRecordSchema.safeParse(record).success)
    ).toBe(true);
  });

  it("resolves persona presets and returns the effective ranking policy", () => {
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

    const run = recommendBenefits(fixtureBenefits, request());
    expect(run.rankingPolicy.effectiveWeights).toEqual(resolveWeights("general", {}));
    expect(run.rankingPolicy.scoreMeaning).toBe("relative_relevance_not_eligibility");
  });

  it("composes matching assessment, ranking, provenance, links, and freshness", () => {
    const run = recommendBenefits(fixtureBenefits, request());
    const rent = run.results.find((candidate) => candidate.id === "seoul-youth-rent-support");

    expect(rent?.assessment.status).toBe("candidate");
    expect(rent?.ranking.score).toBeGreaterThan(0);
    expect(rent?.provenance).toEqual(fixtureBenefits[0]?.provenance);
    expect(rent?.links).toEqual(fixtureBenefits[0]?.links);
    expect(rent?.freshness).toEqual({
      status: "fresh",
      observedAt: fixtureBenefits[0]?.lastFetchedAt
    });
  });

  it("always returns authoritative conflicts as candidates for verification", () => {
    const run = recommendBenefits(
      [fixtureBenefits[0]!],
      request({
        profile: { ...completeProfile, regionCode: "KR-26" }
      })
    );

    expect(run.results).toHaveLength(1);
    expect(run.results[0]?.assessment.status).toBe("conflict_detected");
  });

  it("carries stale link health into candidate freshness without dropping links", () => {
    const record: BenefitRecord = {
      ...fixtureBenefits[0]!,
      links: fixtureBenefits[0]!.links.map((link, index) =>
        index === 0 ? { ...link, health: "stale" as const } : link
      )
    };
    const run = recommendBenefits([record], request());

    expect(run.results[0]?.links).toEqual(record.links);
    expect(run.results[0]?.freshness).toEqual({
      status: "stale",
      observedAt: record.lastFetchedAt
    });
  });

  it("changes ranking/order across personas while keeping assessment deep-equal", () => {
    const [studentFocused, employmentFocused] = personaSensitiveRecords();
    const profile = {
      ...completeProfile,
      studentStatus: "student" as const,
      employmentStatus: "unemployed" as const,
      interests: []
    };
    const university = recommendBenefits(
      [studentFocused, employmentFocused],
      request({ profile: { ...profile, persona: "university_student" }, query: "공통 검색" })
    );
    const jobseeker = recommendBenefits(
      [studentFocused, employmentFocused],
      request({ profile: { ...profile, persona: "youth_jobseeker" }, query: "공통 검색" })
    );

    expect(university.results.map((candidate) => candidate.id)).toEqual([
      "student-focused",
      "employment-focused"
    ]);
    expect(jobseeker.results.map((candidate) => candidate.id)).toEqual([
      "employment-focused",
      "student-focused"
    ]);

    const assessmentById = (records: typeof university.results) =>
      Object.fromEntries(records.map((candidate) => [candidate.id, candidate.assessment]));
    expect(assessmentById(university.results)).toEqual(assessmentById(jobseeker.results));
    expect(university.results.map((candidate) => candidate.ranking.score)).not.toEqual(
      jobseeker.results.map((candidate) => candidate.ranking.score)
    );
  });

  it("keeps assessment identical when query and weights change", () => {
    const first = recommendBenefits(
      fixtureBenefits,
      request({ query: "서울 월세", weights: { query: 10, region: 0 } })
    );
    const second = recommendBenefits(
      fixtureBenefits,
      request({ query: "완전히 다른 검색어", weights: { query: 0, region: 10 } })
    );
    const assessmentById = (records: typeof first.results) =>
      Object.fromEntries(records.map((candidate) => [candidate.id, candidate.assessment]));

    expect(assessmentById(first.results)).toEqual(assessmentById(second.results));
  });

  it("uses opaque ID rather than display title as the stable score tie-break", () => {
    const zeroWeights = {
      region: 0,
      age: 0,
      student: 0,
      employment: 0,
      household: 0,
      category: 0,
      query: 0
    };
    const first: BenefitRecord = {
      ...fixtureBenefits[0]!,
      id: "a-record",
      title: "나중처럼 보이는 제목"
    };
    const second: BenefitRecord = {
      ...fixtureBenefits[0]!,
      id: "b-record",
      title: "먼저처럼 보이는 제목"
    };
    const initial = recommendBenefits(
      [second, first],
      request({ weights: zeroWeights })
    );
    const changedTitles = recommendBenefits(
      [
        { ...second, title: "가장 앞선 제목" },
        { ...first, title: "가장 뒤인 제목" }
      ],
      request({ weights: zeroWeights })
    );

    expect(initial.results.map((candidate) => candidate.id)).toEqual(["a-record", "b-record"]);
    expect(changedTitles.results.map((candidate) => candidate.id)).toEqual([
      "a-record",
      "b-record"
    ]);
    expect(initial.results.every((candidate) => candidate.ranking.score === 0)).toBe(true);
  });
});

function personaSensitiveRecords(): [BenefitRecord, BenefitRecord] {
  const base = fixtureBenefits[0]!;
  const keepCommonRules = base.constraints.filter(
    (rule) => rule.dimension !== "student" && rule.dimension !== "employment"
  );
  const derivedRule = (
    dimension: "student" | "employment",
    allowedValues: string[]
  ): BenefitRule => {
    if (dimension === "student") {
      return {
        dimension,
        allowedValues: allowedValues as Array<"student" | "not_student">,
        operator: "in",
        basis: "derived_text",
        ruleId: `test.${dimension}`,
        ruleVersion: "1.0.0",
        sourceFields: ["derivedText"],
        explanation: "테스트용 비구조화 순위 근거입니다."
      };
    }
    return {
      dimension,
      allowedValues: allowedValues as Array<"employed" | "self_employed" | "unemployed">,
      operator: "in",
      basis: "derived_text",
      ruleId: `test.${dimension}`,
      ruleVersion: "1.0.0",
      sourceFields: ["derivedText"],
      explanation: "테스트용 비구조화 순위 근거입니다."
    };
  };

  return [
    {
      ...base,
      id: "student-focused",
      category: "other",
      searchableText: "공통 검색",
      constraints: [
        ...keepCommonRules,
        derivedRule("student", ["student"]),
        derivedRule("employment", ["employed"])
      ]
    },
    {
      ...base,
      id: "employment-focused",
      category: "other",
      searchableText: "공통 검색",
      constraints: [
        ...keepCommonRules,
        derivedRule("student", ["not_student"]),
        derivedRule("employment", ["unemployed"])
      ]
    }
  ];
}
