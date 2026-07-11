import {
  normalizeDisplayText,
  type AssessmentConstraint,
  type BenefitRecord,
  type BenefitRule,
  type CandidateAssessment,
  type EligibilityDimension,
  type StrictCoarseProfile
} from "@mcp-gen-ui/schema";

const ASSESSMENT_RULE_VERSION = "2.0.0";
const EXPLANATION_LIMIT = 1_000;

const ELIGIBILITY_DIMENSIONS: EligibilityDimension[] = [
  "region",
  "age",
  "student",
  "employment",
  "household"
];

const DIMENSION_LABEL: Record<EligibilityDimension, string> = {
  region: "거주 지역",
  age: "연령대",
  student: "학생 여부",
  employment: "고용 상태",
  household: "가구 유형"
};

/**
 * Assess a normalized benefit record against a coarse profile.
 *
 * Query text, persona, and ranking weights are intentionally absent from this
 * signature. Only an explicit authoritative structured mismatch can produce a
 * conflict; derived/default evidence always remains unknown.
 */
export function assessBenefit(
  record: BenefitRecord,
  profile: StrictCoarseProfile
): CandidateAssessment {
  const missingInfo = new Set<string>();
  const constraints = ELIGIBILITY_DIMENSIONS.flatMap((dimension) => {
    const rules = record.constraints.filter((rule) => rule.dimension === dimension);
    if (rules.length === 0) {
      missingInfo.add(missingMessage(dimension));
      return [defaultUnknownConstraint(dimension)];
    }

    return rules.map((rule) => assessRule(rule, profile, missingInfo));
  });

  const hasAuthoritativeConflict = constraints.some(
    (constraint) =>
      constraint.basis === "authoritative_structured" &&
      constraint.outcome === "conflict"
  );
  const hasUnknown = constraints.some((constraint) => constraint.outcome === "unknown");

  return {
    status: hasAuthoritativeConflict
      ? "conflict_detected"
      : hasUnknown
        ? "needs_more_info"
        : "candidate",
    constraints,
    missingInfo: [...missingInfo]
  };
}

function assessRule(
  rule: BenefitRule,
  profile: StrictCoarseProfile,
  missingInfo: Set<string>
): AssessmentConstraint {
  const profileValue = profileValueFor(rule.dimension, profile);

  if (rule.basis !== "authoritative_structured") {
    missingInfo.add(nonAuthoritativeMessage(rule.dimension));
    return constraintFromRule(
      rule,
      "unknown",
      `${rule.explanation} 비구조화 근거는 순위 신호로만 사용되며 조건 충돌을 확정하지 않습니다.`
    );
  }

  if (profileValue === undefined) {
    missingInfo.add(missingMessage(rule.dimension));
    return constraintFromRule(
      rule,
      "unknown",
      `${rule.explanation} 프로필의 ${DIMENSION_LABEL[rule.dimension]} 정보가 없어 확인이 필요합니다.`
    );
  }

  if (rule.allowedValues.some((allowedValue) => allowedValue === profileValue)) {
    return constraintFromRule(
      rule,
      "match",
      `${rule.explanation} 구조화된 ${DIMENSION_LABEL[rule.dimension]} 조건과 일치합니다.`
    );
  }

  return constraintFromRule(
    rule,
    "conflict",
    `${rule.explanation} 구조화된 ${DIMENSION_LABEL[rule.dimension]} 조건과 일치하지 않습니다. 공식 출처에서 최종 확인이 필요합니다.`
  );
}

function constraintFromRule(
  rule: BenefitRule,
  outcome: AssessmentConstraint["outcome"],
  explanation: string
): AssessmentConstraint {
  return {
    dimension: rule.dimension,
    outcome,
    basis: rule.basis,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    sourceFields: rule.sourceFields,
    explanation: normalizeDisplayText(explanation, EXPLANATION_LIMIT)
  };
}

function defaultUnknownConstraint(
  dimension: EligibilityDimension
): AssessmentConstraint {
  return {
    dimension,
    outcome: "unknown",
    basis: "default",
    ruleId: `assessment.default.${dimension}`,
    ruleVersion: ASSESSMENT_RULE_VERSION,
    sourceFields: [],
    explanation: `${DIMENSION_LABEL[dimension]}에 대한 구조화된 공식 조건이 없어 추가 확인이 필요합니다.`
  };
}

function profileValueFor(
  dimension: EligibilityDimension,
  profile: StrictCoarseProfile
): string | undefined {
  switch (dimension) {
    case "region":
      return profile.regionCode;
    case "age":
      return profile.ageBand;
    case "student":
      return profile.studentStatus === "unknown" ? undefined : profile.studentStatus;
    case "employment":
      return profile.employmentStatus === "unknown"
        ? undefined
        : profile.employmentStatus;
    case "household":
      return profile.householdType === "unknown" ? undefined : profile.householdType;
  }
}

function missingMessage(dimension: EligibilityDimension): string {
  return `${DIMENSION_LABEL[dimension]} 확인이 필요합니다.`;
}

function nonAuthoritativeMessage(dimension: EligibilityDimension): string {
  return `${DIMENSION_LABEL[dimension]}의 공식 구조화 조건을 확인해야 합니다.`;
}
