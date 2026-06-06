import type {
  BenefitRecord,
  BenefitSearchRequest,
  BenefitSummary,
  RecommendationStatus,
  UserProfile
} from "@mcp-gen-ui/schema";

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
  request: BenefitSearchRequest
): BenefitSummary[] {
  const queryTerms = tokenize(
    `${request.query} ${request.profile.interests.join(" ")}`
  );

  return benefits
    .map((benefit) => classifyBenefit(benefit, request.profile, queryTerms))
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.reasons.length - a.reasons.length
    );
}

function classifyBenefit(
  benefit: BenefitRecord,
  profile: UserProfile,
  queryTerms: string[]
): BenefitSummary {
  const reasons: string[] = [];
  const missingInfo: string[] = [];
  const blockers: string[] = [];

  const searchable =
    `${benefit.title} ${benefit.summary} ${benefit.searchableText}`.toLowerCase();
  if (queryTerms.some((term) => searchable.includes(term))) {
    reasons.push("검색어와 혜택 설명이 일치합니다.");
  }

  evaluateRegion(benefit, profile, reasons, missingInfo, blockers);
  evaluateAge(benefit, profile, reasons, missingInfo, blockers);
  evaluateStudent(benefit, profile, reasons, missingInfo, blockers);
  evaluateEmployment(benefit, profile, reasons, missingInfo, blockers);

  const status = decideStatus(blockers, missingInfo, reasons);

  return {
    id: benefit.id,
    title: benefit.title,
    provider: benefit.provider,
    category: benefit.category,
    summary: benefit.summary,
    status,
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

function decideStatus(
  blockers: string[],
  missingInfo: string[],
  reasons: string[]
): RecommendationStatus {
  if (blockers.length > 0) return "not_applicable";
  if (missingInfo.length > 0 || reasons.length === 0) return "needs_more_info";
  return "candidate";
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
