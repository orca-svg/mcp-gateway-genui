import type {
  BenefitRecord,
  BenefitSearchRequest,
  BenefitSummary,
  RecommendationPersona,
  RecommendationScoreDimension,
  RecommendationStatus,
  RecommendationWeights,
  ScoreBreakdownItem,
  UserProfile
} from "@mcp-gen-ui/schema";
import {
  defaultPersonaRegistry,
  resolveWeights,
  type PersonaRegistry,
  type ResolvedRecommendationWeights
} from "./personas.js";

export { defaultPersonaRegistry, resolveWeights } from "./personas.js";

/**
 * Rule-based, LLM-free recommender.
 *
 * Each benefit is classified as `candidate`, `needs_more_info`, or
 * `not_applicable` against the non-identifying profile, with human-readable
 * evidence attached. Results never claim definitive eligibility — by design
 * the host LLM presents them as candidates.
 */
export function recommendBenefits(
  benefits: BenefitRecord[],
  request: BenefitSearchRequest,
  options: { personas?: PersonaRegistry } = {}
): BenefitSummary[] {
  const queryTerms = tokenize(
    `${request.query} ${request.profile.interests.join(" ")}`
  );
  const scorePlan = buildScorePlan(
    request.profile.persona,
    request.weights ?? {},
    options.personas ?? defaultPersonaRegistry
  );

  return benefits
    .map((benefit) => classifyBenefit(benefit, request.profile, queryTerms, scorePlan))
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.score - a.score ||
        b.reasons.length - a.reasons.length ||
        a.title.localeCompare(b.title, "ko")
    );
}

function classifyBenefit(
  benefit: BenefitRecord,
  profile: UserProfile,
  queryTerms: string[],
  scorePlan: ScorePlan
): BenefitSummary {
  const reasons: string[] = [];
  const missingInfo: string[] = [];
  const blockers: string[] = [];

  const searchable = searchableTextFor(benefit);
  const queryMatched = queryTerms.some((term) => searchable.includes(term));
  if (queryMatched) {
    reasons.push("검색어와 혜택 설명이 일치합니다.");
  }

  evaluateRegion(benefit, profile, reasons, missingInfo, blockers);
  evaluateAge(benefit, profile, reasons, missingInfo, blockers);
  evaluateStudent(benefit, profile, reasons, missingInfo, blockers);
  evaluateEmployment(benefit, profile, reasons, missingInfo, blockers);
  evaluateHousehold(benefit, profile, reasons, missingInfo);

  const status = decideStatus(blockers, missingInfo, reasons);
  const scoreBreakdown = computeScoreBreakdown(
    benefit,
    profile,
    queryTerms,
    scorePlan
  );
  const score = normalizeScore(scoreBreakdown);

  return {
    id: benefit.id,
    title: benefit.title,
    provider: benefit.provider,
    category: benefit.category,
    summary: benefit.summary,
    status,
    score,
    scoreBreakdown,
    reasons: status === "not_applicable" ? blockers : reasons,
    missingInfo
  };
}

function evaluateRegion(
  benefit: BenefitRecord,
  profile: UserProfile,
  reasons: string[],
  missingInfo: string[],
  blockers: string[]
): void {
  if (benefit.regionTags.length === 0) return;
  if (!profile.region) {
    missingInfo.push("거주 지역 확인이 필요합니다.");
  } else if (benefit.regionTags.includes(profile.region)) {
    reasons.push(`${profile.region} 지역 조건과 일치합니다.`);
  } else {
    blockers.push(`${profile.region} 지역 대상 혜택이 아닙니다.`);
  }
}

function evaluateAge(
  benefit: BenefitRecord,
  profile: UserProfile,
  reasons: string[],
  missingInfo: string[],
  blockers: string[]
): void {
  if (benefit.ageRanges.length === 0) return;
  if (!profile.ageRange) {
    missingInfo.push("나이대 확인이 필요합니다.");
  } else if (benefit.ageRanges.includes(profile.ageRange)) {
    reasons.push("나이대 조건과 일치합니다.");
  } else {
    blockers.push("나이대 조건이 맞지 않을 수 있습니다.");
  }
}

function evaluateStudent(
  benefit: BenefitRecord,
  profile: UserProfile,
  reasons: string[],
  missingInfo: string[],
  blockers: string[]
): void {
  if (!benefit.studentOnly) return;
  if (profile.studentStatus === "student") {
    reasons.push("학생 조건과 일치합니다.");
  } else if (profile.studentStatus === "unknown") {
    missingInfo.push("학생 여부 확인이 필요합니다.");
  } else {
    blockers.push("학생 대상 혜택입니다.");
  }
}

function evaluateEmployment(
  benefit: BenefitRecord,
  profile: UserProfile,
  reasons: string[],
  missingInfo: string[],
  blockers: string[]
): void {
  if (benefit.employmentStatuses.length === 0) return;
  if (benefit.employmentStatuses.includes(profile.employmentStatus)) {
    reasons.push("고용 상태 조건과 일치합니다.");
  } else if (profile.employmentStatus === "unknown") {
    missingInfo.push("고용 상태 확인이 필요합니다.");
  } else {
    blockers.push("고용 상태 조건이 맞지 않을 수 있습니다.");
  }
}

function evaluateHousehold(
  benefit: BenefitRecord,
  profile: UserProfile,
  reasons: string[],
  _missingInfo: string[]
): void {
  const householdTypes = benefit.householdTypes ?? [];
  if (householdTypes.length === 0 || profile.householdType === "unknown") return;
  if (householdTypes.includes(profile.householdType)) {
    reasons.push("가구 유형 조건과 일치합니다.");
  }
}

function decideStatus(
  blockers: string[],
  missingInfo: string[],
  reasons: string[]
): RecommendationStatus {
  if (blockers.length > 0) return "not_applicable";
  if (missingInfo.length > 0 || reasons.length === 0) return "needs_more_info";
  return "candidate";
}

const SCORE_DIMENSIONS: RecommendationScoreDimension[] = [
  "region",
  "age",
  "student",
  "employment",
  "household",
  "category",
  "query"
];

type ScorePlan = {
  dimensions: RecommendationScoreDimension[];
  weights: ResolvedRecommendationWeights;
};

function buildScorePlan(
  persona: RecommendationPersona | undefined,
  overrides: RecommendationWeights,
  registry: PersonaRegistry
): ScorePlan {
  return {
    dimensions: SCORE_DIMENSIONS,
    weights: resolveWeights(persona ?? "general", overrides, registry)
  };
}

function computeScoreBreakdown(
  benefit: BenefitRecord,
  profile: UserProfile,
  queryTerms: string[],
  scorePlan: ScorePlan
): ScoreBreakdownItem[] {
  return scorePlan.dimensions.map((dimension) => {
    const signal = scoreSignal(dimension, benefit, profile, queryTerms);
    const weight = scorePlan.weights[dimension];
    return {
      dimension,
      signal: signal.value,
      weight,
      contribution: roundScore(signal.value * weight),
      explanation: signal.explanation
    };
  });
}

function normalizeScore(scoreBreakdown: ScoreBreakdownItem[]): number {
  const totalWeight = scoreBreakdown.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  const totalContribution = scoreBreakdown.reduce(
    (sum, item) => sum + item.contribution,
    0
  );
  return roundScore(totalContribution / totalWeight);
}

function scoreSignal(
  dimension: RecommendationScoreDimension,
  benefit: BenefitRecord,
  profile: UserProfile,
  queryTerms: string[]
): { value: number; explanation: string } {
  switch (dimension) {
    case "region":
      return constrainedStringSignal(
        benefit.regionTags,
        profile.region,
        "지역 조건이 없어서 감점하지 않았습니다.",
        "지역 조건과 일치합니다.",
        "거주 지역 정보가 없어 부분 점수를 적용했습니다.",
        "지역 조건과 일치하지 않습니다."
      );
    case "age":
      return constrainedStringSignal(
        benefit.ageRanges,
        profile.ageRange,
        "나이대 조건이 없어서 감점하지 않았습니다.",
        "나이대 조건과 일치합니다.",
        "나이대 정보가 없어 부분 점수를 적용했습니다.",
        "나이대 조건과 일치하지 않습니다."
      );
    case "student":
      if (!benefit.studentOnly) {
        return { value: 1, explanation: "학생 전용 조건이 없어서 감점하지 않았습니다." };
      }
      if (profile.studentStatus === "student") {
        return { value: 1, explanation: "학생 조건과 일치합니다." };
      }
      if (profile.studentStatus === "unknown") {
        return { value: 0.5, explanation: "학생 여부 정보가 없어 부분 점수를 적용했습니다." };
      }
      return { value: 0, explanation: "학생 조건과 일치하지 않습니다." };
    case "employment":
      return constrainedStringSignal(
        benefit.employmentStatuses,
        profile.employmentStatus === "unknown" ? undefined : profile.employmentStatus,
        "고용 상태 조건이 없어서 감점하지 않았습니다.",
        "고용 상태 조건과 일치합니다.",
        "고용 상태 정보가 없어 부분 점수를 적용했습니다.",
        "고용 상태 조건과 일치하지 않습니다."
      );
    case "household":
      return constrainedStringSignal(
        benefit.householdTypes ?? [],
        profile.householdType === "unknown" ? undefined : profile.householdType,
        "가구 유형 조건이 없어서 감점하지 않았습니다.",
        "가구 유형 조건과 일치합니다.",
        "가구 유형 정보가 없어 부분 점수를 적용했습니다.",
        "가구 유형 조건과 일치하지 않습니다."
      );
    case "category":
      if (profile.interests.length === 0) {
        return { value: 0.5, explanation: "관심 분야가 없어 부분 점수를 적용했습니다." };
      }
      return profile.interests.includes(benefit.category)
        ? { value: 1, explanation: "관심 분야와 혜택 분야가 일치합니다." }
        : { value: 0, explanation: "관심 분야와 혜택 분야가 일치하지 않습니다." };
    case "query":
      if (queryTerms.length === 0) {
        return { value: 0, explanation: "검색어 신호가 없습니다." };
      }
      return queryTerms.some((term) => searchableTextFor(benefit).includes(term))
        ? { value: 1, explanation: "검색어와 혜택 설명이 일치합니다." }
        : { value: 0, explanation: "검색어와 혜택 설명이 일치하지 않습니다." };
  }
}

function constrainedStringSignal<T extends string>(
  requiredValues: T[],
  profileValue: T | undefined,
  unconstrainedExplanation: string,
  matchExplanation: string,
  missingExplanation: string,
  mismatchExplanation: string
): { value: number; explanation: string } {
  if (requiredValues.length === 0) {
    return { value: 1, explanation: unconstrainedExplanation };
  }
  if (!profileValue) {
    return { value: 0.5, explanation: missingExplanation };
  }
  if (requiredValues.includes(profileValue)) {
    return { value: 1, explanation: matchExplanation };
  }
  return { value: 0, explanation: mismatchExplanation };
}

function searchableTextFor(benefit: BenefitRecord): string {
  return `${benefit.title} ${benefit.summary} ${benefit.searchableText}`.toLowerCase();
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,./]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function statusRank(status: RecommendationStatus): number {
  if (status === "candidate") return 0;
  if (status === "needs_more_info") return 1;
  return 2;
}
