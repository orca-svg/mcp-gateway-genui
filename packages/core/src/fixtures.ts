import type {
  BenefitRecord,
  ProvenanceRecord,
  RegionCode,
  VerifiedLink
} from "@mcp-gen-ui/schema";

const OBSERVED_AT = "2026-07-10T00:00:00.000Z";
const SOURCE_ID = "fixture-benefits";
const SOURCE_REVISION = "fixture-2026-07-10";

const ALL_REGIONS: RegionCode[] = [
  "KR-11",
  "KR-26",
  "KR-27",
  "KR-28",
  "KR-29",
  "KR-30",
  "KR-31",
  "KR-36",
  "KR-41",
  "KR-42",
  "KR-43",
  "KR-44",
  "KR-45",
  "KR-46",
  "KR-47",
  "KR-48",
  "KR-49"
];

function authoritativeRule(
  ruleId: string,
  sourceFields: string[],
  explanation: string
) {
  return {
    operator: "in" as const,
    basis: "authoritative_structured" as const,
    ruleId,
    ruleVersion: "1.0.0",
    sourceFields,
    explanation
  };
}

function provenance(
  sourceRecordId: string,
  contentHash: string
): ProvenanceRecord[] {
  return [
    {
      field: "",
      sourceId: SOURCE_ID,
      sourceRecordId,
      authority: "authoritative_structured",
      contentHash,
      observedAt: OBSERVED_AT,
      sourceRevision: SOURCE_REVISION,
      license: "Public fixture data",
      attribution: "mcp-gen-ui deterministic fixtures"
    }
  ];
}

function links(sourceUrl: string, applicationUrl: string): VerifiedLink[] {
  return [
    {
      rel: "source",
      url: sourceUrl,
      official: true,
      health: "verified",
      verifiedAt: OBSERVED_AT,
      verificationMethod: "Fixture exact-origin registry"
    },
    {
      rel: "apply",
      url: applicationUrl,
      official: true,
      health: "verified",
      verifiedAt: OBSERVED_AT,
      verificationMethod: "Fixture exact-origin registry"
    }
  ];
}

/** Deterministic, normalized, non-identifying fixture records. */
export const fixtureBenefits: BenefitRecord[] = [
  {
    id: "seoul-youth-rent-support",
    sourceId: SOURCE_ID,
    sourceRecordId: "seoul-youth-rent-support",
    sourceRevision: SOURCE_REVISION,
    contentHash: "a".repeat(64),
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
    applicationDeadline: "2030-07-15T09:00:00.000Z",
    fee: "없음",
    processingTime: "공고별 상이",
    documents: [
      {
        id: "resident-proof",
        label: "거주지 확인 서류",
        required: true,
        source: SOURCE_ID
      },
      {
        id: "rent-contract",
        label: "임대차계약서",
        required: true,
        source: SOURCE_ID
      },
      {
        id: "income-proof",
        label: "소득 확인 서류",
        required: true,
        source: SOURCE_ID
      }
    ],
    applicationMethods: ["온라인 신청", "공고문 확인 후 제출"],
    constraints: [
      {
        dimension: "region",
        allowedValues: ["KR-11"],
        ...authoritativeRule(
          "fixture.rent.region",
          ["regionCode"],
          "공식 구조화 필드가 서울 지역을 지정합니다."
        )
      },
      {
        dimension: "age",
        allowedValues: ["twenties", "thirties"],
        ...authoritativeRule(
          "fixture.rent.age",
          ["minimumAge", "maximumAge"],
          "공식 구조화 연령 범위를 연령대로 투영했습니다."
        )
      },
      {
        dimension: "student",
        allowedValues: ["student", "not_student"],
        ...authoritativeRule(
          "fixture.rent.student",
          ["studentRestriction"],
          "공식 필드에 학생 여부 제한이 없습니다."
        )
      },
      {
        dimension: "employment",
        allowedValues: ["employed", "self_employed", "unemployed"],
        ...authoritativeRule(
          "fixture.rent.employment",
          ["employmentRestriction"],
          "공식 필드에 고용 상태 제한이 없습니다."
        )
      },
      {
        dimension: "household",
        allowedValues: ["single"],
        ...authoritativeRule(
          "fixture.rent.household",
          ["householdType"],
          "공식 구조화 필드가 1인 가구를 지정합니다."
        )
      }
    ],
    searchableText: "서울 청년 월세 주거 주택 임대차 지원 대학생",
    provenance: provenance("seoul-youth-rent-support", "a".repeat(64)),
    links: links(
      "https://www.gov.kr/portal/service/serviceInfo/611000000119",
      "https://www.gov.kr/portal/service/serviceInfo/611000000119"
    ),
    lastFetchedAt: OBSERVED_AT
  },
  {
    id: "national-scholarship",
    sourceId: SOURCE_ID,
    sourceRecordId: "national-scholarship",
    sourceRevision: SOURCE_REVISION,
    contentHash: "b".repeat(64),
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
      {
        id: "student-status",
        label: "재학 상태 확인",
        required: true,
        source: SOURCE_ID
      },
      {
        id: "household-consent",
        label: "가구원 정보제공 동의",
        required: true,
        source: SOURCE_ID
      }
    ],
    applicationMethods: ["한국장학재단 온라인 신청"],
    constraints: [
      {
        dimension: "region",
        allowedValues: ALL_REGIONS,
        ...authoritativeRule(
          "fixture.scholarship.region",
          ["nationalProgram"],
          "전국 단위 공식 사업입니다."
        )
      },
      {
        dimension: "age",
        allowedValues: ["teen", "twenties", "thirties"],
        ...authoritativeRule(
          "fixture.scholarship.age",
          ["studentAgeBands"],
          "공식 구조화 대상 연령대를 사용합니다."
        )
      },
      {
        dimension: "student",
        allowedValues: ["student"],
        ...authoritativeRule(
          "fixture.scholarship.student",
          ["studentOnly"],
          "공식 구조화 필드가 재학생을 지정합니다."
        )
      },
      {
        dimension: "employment",
        allowedValues: ["employed", "self_employed", "unemployed"],
        ...authoritativeRule(
          "fixture.scholarship.employment",
          ["employmentRestriction"],
          "공식 필드에 고용 상태 제한이 없습니다."
        )
      },
      {
        dimension: "household",
        allowedValues: ["single", "couple", "family", "single_parent"],
        ...authoritativeRule(
          "fixture.scholarship.household",
          ["householdRestriction"],
          "공식 필드에 가구 유형 제한이 없습니다."
        )
      }
    ],
    searchableText: "대학생 장학금 등록금 학자금 교육 지원",
    provenance: provenance("national-scholarship", "b".repeat(64)),
    links: links(
      "https://www.gov.kr/portal/service/serviceInfo/B55252900001",
      "https://www.kosaf.go.kr/"
    ),
    lastFetchedAt: OBSERVED_AT
  },
  {
    id: "job-seeker-allowance",
    sourceId: SOURCE_ID,
    sourceRecordId: "job-seeker-allowance",
    sourceRevision: SOURCE_REVISION,
    contentHash: "c".repeat(64),
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
      {
        id: "job-seeker-profile",
        label: "구직 신청 정보",
        required: true,
        source: SOURCE_ID
      },
      {
        id: "income-assets",
        label: "소득·재산 확인 자료",
        required: true,
        source: SOURCE_ID
      }
    ],
    applicationMethods: ["온라인 신청", "고용센터 방문"],
    constraints: [
      {
        dimension: "region",
        allowedValues: ALL_REGIONS,
        ...authoritativeRule(
          "fixture.job.region",
          ["nationalProgram"],
          "전국 단위 공식 사업입니다."
        )
      },
      {
        dimension: "age",
        allowedValues: ["twenties", "thirties", "forties", "fifties"],
        ...authoritativeRule(
          "fixture.job.age",
          ["minimumAge", "maximumAge"],
          "공식 구조화 대상 연령대를 사용합니다."
        )
      },
      {
        dimension: "student",
        allowedValues: ["student", "not_student"],
        ...authoritativeRule(
          "fixture.job.student",
          ["studentRestriction"],
          "공식 필드에 학생 여부 제한이 없습니다."
        )
      },
      {
        dimension: "employment",
        allowedValues: ["unemployed"],
        ...authoritativeRule(
          "fixture.job.employment",
          ["employmentStatuses"],
          "공식 구조화 필드가 구직 상태를 지정합니다."
        )
      },
      {
        dimension: "household",
        allowedValues: ["single", "couple", "family", "single_parent"],
        ...authoritativeRule(
          "fixture.job.household",
          ["householdRestriction"],
          "공식 필드에 가구 유형 제한이 없습니다."
        )
      }
    ],
    searchableText: "구직 취업 청년 실업 고용 지원 수당",
    provenance: provenance("job-seeker-allowance", "c".repeat(64)),
    links: links(
      "https://www.gov.kr/portal/service/serviceInfo/149200000001",
      "https://www.kua.go.kr/"
    ),
    lastFetchedAt: OBSERVED_AT
  }
];
