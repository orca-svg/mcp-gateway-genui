import type {
  BenefitDetail,
  BenefitSearchResponse,
  RecommendationPersona,
  RecommendationWeights,
  UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";

export type DemoPersonaPreset = {
  id: RecommendationPersona;
  description: string;
  weights: Required<RecommendationWeights>;
};

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
        },
        {
          dimension: "age",
          signal: 1,
          weight: 2,
          contribution: 2,
          explanation: "청년 연령대 조건과 일치합니다."
        },
        {
          dimension: "student",
          signal: 0.5,
          weight: 3,
          contribution: 1.5,
          explanation: "학생에게도 열려 있지만 주거 조건 확인이 우선입니다."
        },
        {
          dimension: "category",
          signal: 1,
          weight: 2,
          contribution: 2,
          explanation: "관심 분야(housing)와 일치합니다."
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
          weight: 3,
          contribution: 3,
          explanation: "학생 조건과 일치합니다."
        },
        {
          dimension: "age",
          signal: 1,
          weight: 2,
          contribution: 2,
          explanation: "대학생 연령대와 잘 맞습니다."
        },
        {
          dimension: "category",
          signal: 1,
          weight: 2,
          contribution: 2,
          explanation: "관심 분야(education)와 일치합니다."
        },
        {
          dimension: "region",
          signal: 0,
          weight: 1,
          contribution: 0,
          explanation: "전국 사업이라 지역 가중치 기여가 없습니다."
        }
      ],
      reasons: ["학생 조건과 일치합니다."],
      missingInfo: ["학자금 지원 구간 확인이 필요합니다."]
    }
  ]
};

export const demoUpcomingDeadlines: UpcomingDeadlinesResponse = {
  profile: demoSearchResponse.profile,
  withinDays: 60,
  generatedAt: "2026-05-20T00:00:00.000Z",
  results: [
    {
      ...demoSearchResponse.results[0],
      applicationDeadline: "2026-06-30T14:59:59.000Z"
    },
    {
      ...demoSearchResponse.results[1],
      applicationDeadline: "2026-07-18T14:59:59.000Z"
    }
  ]
};

export const demoPersonas: DemoPersonaPreset[] = [
  {
    id: "university_student",
    description: "대학생: 학생 여부, 연령대, 교육/주거 분야 적합도를 더 크게 반영합니다.",
    weights: {
      region: 1,
      age: 2,
      student: 3,
      employment: 1,
      household: 1,
      category: 2,
      query: 1
    }
  },
  {
    id: "youth_jobseeker",
    description: "청년 구직자: 고용 상태, 청년 연령대, 검색 의도를 우선합니다.",
    weights: {
      region: 1,
      age: 2,
      student: 1,
      employment: 3,
      household: 1,
      category: 1.5,
      query: 2
    }
  },
  {
    id: "general",
    description: "일반: 모든 점수 차원을 동일 가중치로 해석합니다.",
    weights: {
      region: 1,
      age: 1,
      student: 1,
      employment: 1,
      household: 1,
      category: 1,
      query: 1
    }
  }
];

export const demoBenefitDetail: BenefitDetail = {
  id: "seoul-youth-rent-support",
  title: "서울 청년 월세 지원",
  provider: "서울특별시",
  category: "housing",
  summary: "서울 거주 청년의 주거비 부담을 줄이기 위한 월세 지원 사업입니다.",
  target: "서울시에 거주하는 청년 1인 가구 중 공고 조건을 충족하는 신청자",
  eligibility: ["서울 거주", "청년 연령대", "무주택 또는 주거 지원 필요", "공고별 소득 기준 확인 필요"],
  applicationPeriod: "2026-06-01 ~ 2026-06-30",
  applicationDeadline: "2026-06-30T14:59:59.000Z",
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
