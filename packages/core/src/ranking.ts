import type {
  BenefitRecord,
  BenefitRule,
  Ranking,
  RankingPolicy,
  RecommendationPersona,
  RecommendationScoreDimension,
  RecommendationWeights,
  ScoreBreakdownItem,
  StrictCoarseProfile
} from "@mcp-gen-ui/schema";
import {
  defaultPersonaRegistry,
  resolveWeights,
  type PersonaRegistry
} from "./personas.js";

export const RANKING_POLICY_ID = "weighted-rule-relevance";
export const RANKING_POLICY_VERSION = "2.0.0";

const SCORE_DIMENSIONS: RecommendationScoreDimension[] = [
  "region",
  "age",
  "student",
  "employment",
  "household",
  "category",
  "query"
];

/** Resolve the transparent ranking policy once for a recommendation run. */
export function buildRankingPolicy(
  persona: RecommendationPersona | undefined,
  overrides: RecommendationWeights,
  registry: PersonaRegistry = defaultPersonaRegistry
): RankingPolicy {
  const resolvedPersona = persona ?? "general";
  return {
    id: RANKING_POLICY_ID,
    version: RANKING_POLICY_VERSION,
    persona: resolvedPersona,
    effectiveWeights: resolveWeights(resolvedPersona, overrides, registry),
    scoreMeaning: "relative_relevance_not_eligibility"
  };
}

/** Compute relative retrieval/order relevance; this never changes assessment. */
export function rankBenefit(
  record: BenefitRecord,
  profile: StrictCoarseProfile,
  query: string,
  policy: RankingPolicy
): Ranking {
  const queryTerms = tokenize(query);
  const breakdown = SCORE_DIMENSIONS.map((dimension) => {
    const signal = scoreSignal(dimension, record, profile, queryTerms);
    const weight = policy.effectiveWeights[dimension];
    return {
      dimension,
      signal: signal.value,
      weight,
      contribution: roundScore(signal.value * weight),
      explanation: signal.explanation
    } satisfies ScoreBreakdownItem;
  });

  const totalWeight = breakdown.reduce((sum, item) => sum + item.weight, 0);
  const totalContribution = breakdown.reduce(
    (sum, item) => sum + item.contribution,
    0
  );

  return {
    score: totalWeight === 0 ? 0 : roundScore(totalContribution / totalWeight),
    breakdown
  };
}

function scoreSignal(
  dimension: RecommendationScoreDimension,
  record: BenefitRecord,
  profile: StrictCoarseProfile,
  queryTerms: string[]
): { value: number; explanation: string } {
  switch (dimension) {
    case "region":
      return ruleSignal(
        record,
        "region",
        profile.regionCode,
        "거주 지역"
      );
    case "age":
      return ruleSignal(record, "age", profile.ageBand, "연령대");
    case "student":
      return ruleSignal(
        record,
        "student",
        profile.studentStatus === "unknown" ? undefined : profile.studentStatus,
        "학생 여부"
      );
    case "employment":
      return ruleSignal(
        record,
        "employment",
        profile.employmentStatus === "unknown" ? undefined : profile.employmentStatus,
        "고용 상태"
      );
    case "household":
      return ruleSignal(
        record,
        "household",
        profile.householdType === "unknown" ? undefined : profile.householdType,
        "가구 유형"
      );
    case "category":
      if (profile.interests.length === 0) {
        return { value: 0.5, explanation: "관심 분야가 없어 중립 순위 신호를 적용했습니다." };
      }
      return profile.interests.includes(record.category)
        ? { value: 1, explanation: "관심 분야와 혜택 분야가 일치합니다." }
        : { value: 0, explanation: "관심 분야와 혜택 분야가 일치하지 않습니다." };
    case "query": {
      if (queryTerms.length === 0) {
        return { value: 0, explanation: "검색어 순위 신호가 없습니다." };
      }
      const searchable = record.searchableText.toLocaleLowerCase("ko");
      const matched = queryTerms.filter((term) => searchable.includes(term)).length;
      return {
        value: roundScore(matched / queryTerms.length),
        explanation:
          matched > 0
            ? "검색어와 검색용 색인 텍스트가 관련됩니다."
            : "검색어와 검색용 색인 텍스트가 일치하지 않습니다."
      };
    }
  }
}

function ruleSignal(
  record: BenefitRecord,
  dimension: BenefitRule["dimension"],
  profileValue: string | undefined,
  label: string
): { value: number; explanation: string } {
  const rules = record.constraints.filter((rule) => rule.dimension === dimension);
  if (rules.length === 0) {
    return { value: 0.5, explanation: `${label} 조건 근거가 없어 중립 순위 신호를 적용했습니다.` };
  }
  if (profileValue === undefined) {
    return { value: 0.5, explanation: `${label} 프로필 정보가 없어 중립 순위 신호를 적용했습니다.` };
  }

  const matched = rules.filter((rule) =>
    rule.allowedValues.some((allowedValue) => allowedValue === profileValue)
  ).length;
  const value = roundScore(matched / rules.length);
  return {
    value,
    explanation:
      matched > 0
        ? `${label} 근거가 순위 관련성에 기여했습니다.`
        : `${label} 근거가 프로필과 일치하지 않아 순위 점수를 낮췄습니다.`
  };
}

function tokenize(input: string): string[] {
  return input
    .toLocaleLowerCase("ko")
    .split(/[\s,./]+/u)
    .map((term) => term.trim())
    .filter((term) => Array.from(term).length >= 2);
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
