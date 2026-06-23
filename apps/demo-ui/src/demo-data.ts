import type {
  BenefitDetail,
  BenefitSearchResponse,
  UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";

/**
 * Fixture domain JSON the demo renders. In a real host these objects come back
 * from the MCP tools; here they are inlined so the UI runs with no server or
 * live government-site dependency. Each `DemoScenario` bundles one full gateway
 * run so the UI can switch between scenarios entirely client-side.
 */

export type DemoSourceStatus = "ok" | "cached" | "fallback";

export type DemoSource = {
  id: string;
  provider: string;
  dataset: string;
  status: DemoSourceStatus;
};

export type DemoToolTrace = {
  tool: string;
  status: DemoSourceStatus;
  durationMs: number;
};

export type DemoScenario = {
  id: string;
  label: string;
  search: BenefitSearchResponse;
  /** Per-benefit application detail, keyed by benefit id, so each card drives its own prep view. */
  details: Record<string, BenefitDetail>;
  deadlines: UpcomingDeadlinesResponse;
  personas: { id: string; description: string }[];
  sources: DemoSource[];
  traces: DemoToolTrace[];
};

export const demoPersonas: { id: string; description: string }[] = [
  { id: "youth_jobseeker", description: "취업 적합도·연령·검색 의도를 우선하는 청년 구직자" },
  { id: "university_student", description: "학생 자격과 교육 지원을 우선하는 대학생" },
  { id: "newlywed_family", description: "가구 구성과 주거를 우선하는 신혼·가족" },
  { id: "single_parent", description: "가구 지원과 생활 안정을 우선하는 한부모" },
  { id: "senior", description: "연령과 건강·복지를 우선하는 어르신" },
  { id: "general", description: "모든 점수 차원 가중치가 동일한 기본값" }
];

const studentSearch: BenefitSearchResponse = {
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

const studentDetail: BenefitDetail = {
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

const scholarshipDetail: BenefitDetail = {
  id: "national-scholarship",
  title: "국가장학금",
  provider: "한국장학재단",
  category: "education",
  summary: "대학생의 등록금 부담 완화를 위한 소득연계형 장학금입니다.",
  target: "국내 대학에 재학 중인 소득 구간 충족 대학생",
  eligibility: ["국내 대학 재학", "소득·재산 구간 확인 필요", "성적 기준 충족"],
  applicationPeriod: "학기별 신청 기간",
  fee: "없음",
  processingTime: "심사 후 학기 중 지급",
  documents: [
    { id: "enrollment", label: "재학증명서", required: true, source: "program" },
    { id: "income-bracket", label: "소득분위 확인 서류", required: true, source: "program" },
    { id: "grade-proof", label: "직전 학기 성적증명서", required: false, source: "program" }
  ],
  applicationMethods: ["한국장학재단 온라인 신청"],
  applicationUrl: "https://www.kosaf.go.kr",
  sourceUrl: "https://www.kosaf.go.kr",
  lastFetchedAt: "2026-05-20T00:00:00.000Z",
  evidence: []
};

const studentDeadlines: UpcomingDeadlinesResponse = {
  profile: studentSearch.profile,
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

const jobseekerSearch: BenefitSearchResponse = {
  query: "미취업 청년 취업 지원",
  profile: {
    region: "서울",
    ageRange: "twenties",
    studentStatus: "unknown",
    employmentStatus: "unemployed",
    householdType: "unknown",
    interests: ["employment"],
    persona: "youth_jobseeker"
  },
  generatedAt: "2026-05-26T00:00:00.000Z",
  results: [
    {
      id: "national-employment-support",
      title: "국민취업지원제도",
      provider: "고용노동부",
      category: "employment",
      summary: "미취업 청년에게 구직활동 지원과 취업활동비를 제공하는 제도입니다.",
      status: "candidate",
      score: 0.88,
      scoreBreakdown: [
        {
          dimension: "employment",
          signal: 1,
          weight: 3,
          contribution: 3,
          explanation: "미취업 상태 조건과 일치합니다."
        }
      ],
      reasons: ["미취업 청년 조건과 일치합니다.", "검색 의도와 일치합니다."],
      missingInfo: []
    },
    {
      id: "youth-job-leap",
      title: "청년 일자리 도약 장려금",
      provider: "고용노동부",
      category: "employment",
      summary: "청년을 정규직으로 채용한 기업을 지원해 청년 고용을 촉진합니다.",
      status: "needs_more_info",
      score: 0.74,
      scoreBreakdown: [
        {
          dimension: "age",
          signal: 1,
          weight: 2,
          contribution: 2,
          explanation: "청년 연령대 조건과 일치합니다."
        }
      ],
      reasons: ["청년 연령대 조건과 일치합니다."],
      missingInfo: ["채용 기업 요건 확인이 필요합니다."]
    }
  ]
};

const jobseekerDetail: BenefitDetail = {
  id: "national-employment-support",
  title: "국민취업지원제도",
  provider: "고용노동부",
  category: "employment",
  summary: "미취업 청년에게 구직활동 지원과 취업활동비를 제공하는 제도입니다.",
  target: "취업을 희망하는 15~69세 구직자 중 소득·재산 요건을 충족하는 사람",
  eligibility: ["미취업 상태", "청년 연령대", "공고별 소득·재산 기준 확인 필요"],
  applicationPeriod: "상시",
  fee: "없음",
  processingTime: "공고별 상이",
  documents: [
    { id: "id-proof", label: "신분증", required: true, source: "program" },
    { id: "job-plan", label: "구직활동계획서", required: true, source: "program" },
    { id: "income-proof", label: "소득 확인 서류", required: true, source: "program" }
  ],
  applicationMethods: ["워크넷 온라인 신청", "고용센터 방문 신청"],
  applicationUrl: "https://www.work.go.kr",
  sourceUrl: "https://www.work.go.kr",
  lastFetchedAt: "2026-05-26T00:00:00.000Z",
  evidence: []
};

const youthJobLeapDetail: BenefitDetail = {
  id: "youth-job-leap",
  title: "청년 일자리 도약 장려금",
  provider: "고용노동부",
  category: "employment",
  summary: "청년을 정규직으로 채용한 기업을 지원해 청년 고용을 촉진합니다.",
  target: "청년을 정규직으로 채용한 우선지원 대상 기업",
  eligibility: ["우선지원 대상 기업", "청년 정규직 채용", "고용 유지 요건 확인 필요"],
  applicationPeriod: "사업 공고 기간",
  fee: "없음",
  processingTime: "공고별 상이",
  documents: [
    { id: "biz-reg", label: "사업자등록증", required: true, source: "program" },
    { id: "employment-contract", label: "청년 근로계약서", required: true, source: "program" },
    { id: "payroll", label: "급여대장", required: true, source: "program" }
  ],
  applicationMethods: ["고용24 온라인 신청"],
  applicationUrl: "https://www.work.go.kr",
  sourceUrl: "https://www.work.go.kr",
  lastFetchedAt: "2026-05-26T00:00:00.000Z",
  evidence: []
};

const jobseekerDeadlines: UpcomingDeadlinesResponse = {
  profile: jobseekerSearch.profile,
  withinDays: 30,
  generatedAt: "2026-05-26T00:00:00.000Z",
  results: [
    {
      id: "youth-job-leap",
      title: "청년 일자리 도약 장려금",
      provider: "고용노동부",
      category: "employment",
      summary: "청년을 정규직으로 채용한 기업을 지원해 청년 고용을 촉진합니다.",
      status: "needs_more_info",
      score: 0.74,
      scoreBreakdown: [],
      reasons: [],
      missingInfo: [],
      applicationDeadline: "2026-09-30T14:59:59.000Z"
    }
  ]
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "seoul-student",
    label: "서울 거주 대학생",
    search: studentSearch,
    details: {
      "seoul-youth-rent-support": studentDetail,
      "national-scholarship": scholarshipDetail
    },
    deadlines: studentDeadlines,
    personas: demoPersonas,
    sources: [
      { id: "seoul-housing", provider: "서울특별시", dataset: "청년 월세 지원 공고", status: "ok" },
      { id: "kosaf", provider: "한국장학재단", dataset: "국가장학금 안내", status: "cached" }
    ],
    traces: [
      { tool: "searchBenefits", status: "ok", durationMs: 42 },
      { tool: "getUpcomingDeadlines", status: "ok", durationMs: 18 },
      { tool: "listPersonas", status: "ok", durationMs: 5 }
    ]
  },
  {
    id: "youth-jobseeker",
    label: "청년 구직자",
    search: jobseekerSearch,
    details: {
      "national-employment-support": jobseekerDetail,
      "youth-job-leap": youthJobLeapDetail
    },
    deadlines: jobseekerDeadlines,
    personas: demoPersonas,
    sources: [
      { id: "ontongyouth", provider: "온통청년", dataset: "청년정책 목록", status: "ok" },
      { id: "moel", provider: "고용노동부", dataset: "고용지원 사업", status: "fallback" }
    ],
    traces: [
      { tool: "searchBenefits", status: "ok", durationMs: 51 },
      { tool: "getUpcomingDeadlines", status: "ok", durationMs: 22 },
      { tool: "listPersonas", status: "fallback", durationMs: 9 }
    ]
  }
];
