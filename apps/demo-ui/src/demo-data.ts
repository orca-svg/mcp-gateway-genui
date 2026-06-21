import type {
  BenefitDetail,
  BenefitSearchResponse,
  UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";

/**
 * Fixture domain JSON the demo renders. In a real host these objects come back
 * from the MCP tools; here they are inlined so the UI runs with no server or
 * live government-site dependency.
 */
export const demoSearchResponse: BenefitSearchResponse = {
  query: "서울 거주 대학생 지원",
  profile: {
    region: "서울",
    ageRange: "twenties",
    studentStatus: "student",
    employmentStatus: "unknown",
    householdType: "unknown",
    interests: ["housing", "education"],
    persona: "university_student"
  },
  generatedAt: "2026-05-20T00:00:00.000Z",
  results: [
    {
      id: "seoul-youth-rent-support",
      title: "서울 청년 월세 지원",
      provider: "서울특별시",
      category: "housing",
      summary: "서울 거주 청년의 주거비 부담을 줄이기 위한 월세 지원 사업입니다.",
      status: "candidate",
      score: 0.92,
      scoreBreakdown: [
        {
          dimension: "region",
          signal: 1,
          weight: 1,
          contribution: 1,
          explanation: "지역 조건과 일치합니다."
        }
      ],
      reasons: ["서울 지역 조건과 일치합니다.", "나이대 조건과 일치합니다."],
      missingInfo: []
    },
    {
      id: "national-scholarship",
      title: "국가장학금",
      provider: "한국장학재단",
      category: "education",
      summary: "대학생의 등록금 부담 완화를 위한 소득연계형 장학금입니다.",
      status: "needs_more_info",
      score: 0.71,
      scoreBreakdown: [
        {
          dimension: "student",
          signal: 1,
          weight: 1,
          contribution: 1,
          explanation: "학생 조건과 일치합니다."
        }
      ],
      reasons: ["학생 조건과 일치합니다."],
      missingInfo: ["학자금 지원 구간 확인이 필요합니다."]
    }
  ]
};

export const demoBenefitDetail: BenefitDetail = {
  id: "seoul-youth-rent-support",
  title: "서울 청년 월세 지원",
  provider: "서울특별시",
  category: "housing",
  summary: "서울 거주 청년의 주거비 부담을 줄이기 위한 월세 지원 사업입니다.",
  target: "서울시에 거주하는 청년 1인 가구 중 공고 조건을 충족하는 신청자",
  eligibility: ["서울 거주", "청년 연령대", "무주택 또는 주거 지원 필요", "공고별 소득 기준 확인 필요"],
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
  evidence: []
};

export const demoPersonas: { id: string; description: string }[] = [
  { id: "youth_jobseeker", description: "취업 적합도·연령·검색 의도를 우선하는 청년 구직자" },
  { id: "university_student", description: "학생 자격과 교육 지원을 우선하는 대학생" },
  { id: "newlywed_family", description: "가구 구성과 주거를 우선하는 신혼·가족" },
  { id: "single_parent", description: "가구 지원과 생활 안정을 우선하는 한부모" },
  { id: "senior", description: "연령과 건강·복지를 우선하는 어르신" },
  { id: "general", description: "모든 점수 차원 가중치가 동일한 기본값" }
];

export const demoUpcomingDeadlines: UpcomingDeadlinesResponse = {
  profile: demoSearchResponse.profile,
  withinDays: 30,
  generatedAt: "2026-05-20T00:00:00.000Z",
  results: [
    {
      id: "seoul-youth-rent-support",
      title: "서울 청년 월세 지원",
      provider: "서울특별시",
      category: "housing",
      summary: "서울 거주 청년의 주거비 부담을 줄이기 위한 월세 지원 사업입니다.",
      status: "candidate",
      score: 0.92,
      scoreBreakdown: [],
      reasons: [],
      missingInfo: [],
      applicationDeadline: "2026-12-31T14:59:59.000Z"
    }
  ]
};
