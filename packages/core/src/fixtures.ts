import type { BenefitRecord } from "@mcp-gen-ui/schema";

/**
 * Deterministic, non-identifying sample data so tests and demos reproduce
 * without live government-site dependencies. URLs point at public service
 * pages; no sensitive identifiers are present.
 */
export const fixtureBenefits: BenefitRecord[] = [
  {
    id: "seoul-youth-rent-support",
    title: "서울 청년 월세 지원",
    provider: "서울특별시",
    category: "housing",
    summary: "서울 거주 청년의 주거비 부담을 줄이기 위한 월세 지원 사업입니다.",
    target: "서울시에 거주하는 청년 1인 가구 중 공고 조건을 충족하는 신청자",
    eligibility: [
      "서울 거주",
      "청년 연령대",
      "무주택 또는 주거 지원 필요",
      "공고별 소득 기준 확인 필요"
    ],
    applicationPeriod: "공고별 상이",
    fee: "없음",
    processingTime: "공고별 상이",
    documents: [
      { id: "resident-proof", label: "거주지 확인 서류", required: true, source: "program" },
      { id: "rent-contract", label: "임대차계약서", required: true, source: "program" },
      { id: "income-proof", label: "소득 확인 서류", required: true, source: "program" }
    ],
    applicationMethods: ["온라인 신청", "공고문 확인 후 제출"],
    applicationUrl: "https://www.gov.kr/portal/service/serviceInfo/611000000119",
    sourceUrl: "https://www.gov.kr/portal/service/serviceInfo/611000000119",
    lastFetchedAt: "2026-05-20T00:00:00.000Z",
    evidence: [],
    searchableText: "서울 청년 월세 주거 주택 임대차 지원 대학생",
    regionTags: ["서울"],
    ageRanges: ["twenties", "thirties"],
    studentOnly: false,
    employmentStatuses: []
  },
  {
    id: "national-scholarship",
    title: "국가장학금",
    provider: "한국장학재단",
    category: "education",
    summary: "대학생의 등록금 부담 완화를 위한 소득연계형 장학금입니다.",
    target: "국내 대학 재학생 중 학자금 지원 구간 등 기준을 충족하는 학생",
    eligibility: ["대학생", "학자금 지원 구간 확인 필요", "성적 기준 확인 필요"],
    applicationPeriod: "학기별 신청 기간",
    fee: "없음",
    processingTime: "학기별 심사 일정에 따름",
    documents: [
      { id: "student-status", label: "재학 상태 확인", required: true, source: "program" },
      { id: "household-consent", label: "가구원 정보제공 동의", required: true, source: "program" }
    ],
    applicationMethods: ["한국장학재단 온라인 신청"],
    applicationUrl: "https://www.kosaf.go.kr/",
    sourceUrl: "https://www.gov.kr/portal/service/serviceInfo/B55252900001",
    lastFetchedAt: "2026-05-20T00:00:00.000Z",
    evidence: [],
    searchableText: "대학생 장학금 등록금 학자금 교육 지원",
    regionTags: [],
    ageRanges: ["teen", "twenties", "thirties"],
    studentOnly: true,
    employmentStatuses: []
  },
  {
    id: "job-seeker-allowance",
    title: "국민취업지원제도",
    provider: "고용노동부",
    category: "employment",
    summary: "취업을 원하는 사람에게 취업지원서비스와 수당을 제공하는 제도입니다.",
    target: "취업을 희망하는 구직자 중 유형별 요건을 충족하는 신청자",
    eligibility: ["구직 의사", "소득 및 재산 기준 확인 필요", "취업 상태 확인 필요"],
    applicationPeriod: "상시",
    fee: "없음",
    processingTime: "심사 일정에 따름",
    documents: [
      { id: "job-seeker-profile", label: "구직 신청 정보", required: true, source: "program" },
      { id: "income-assets", label: "소득·재산 확인 자료", required: true, source: "program" }
    ],
    applicationMethods: ["온라인 신청", "고용센터 방문"],
    applicationUrl: "https://www.kua.go.kr/",
    sourceUrl: "https://www.gov.kr/portal/service/serviceInfo/149200000001",
    lastFetchedAt: "2026-05-20T00:00:00.000Z",
    evidence: [],
    searchableText: "구직 취업 청년 실업 고용 지원 수당",
    regionTags: [],
    ageRanges: ["twenties", "thirties", "forties", "fifties"],
    studentOnly: false,
    employmentStatuses: ["unemployed"]
  }
];
