import type {
  BenefitDetail,
  BenefitSearchResponse,
  RecommendationPersona,
  RecommendationWeights,
  ScoreBreakdownItem,
  UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";
import type { DemoPersonaPreset } from "./demo-data";

/**
 * domain JSON -> A2UI adapter.
 *
 * Keeping this mapping separate from the renderer means the same MCP responses
 * can drive different UI front-ends; the React demo is just one renderer of
 * these transport-neutral blocks.
 */
export type A2UIBlock =
  | { type: "section"; id: string; title: string; tone?: "default" | "muted" }
  | {
      type: "persona-selector";
      id: string;
      title: string;
      activePersona?: RecommendationPersona;
      personas: {
        id: RecommendationPersona;
        label: string;
        description: string;
        weights: Required<RecommendationWeights>;
      }[];
    }
  | {
      type: "benefit-card";
      id: string;
      title: string;
      provider: string;
      status: string;
      summary: string;
      score: number;
      scoreBreakdown: ScoreBreakdownItem[];
      reasons: string[];
      missingInfo: string[];
    }
  | {
      type: "deadlines";
      id: string;
      title: string;
      items: {
        id: string;
        title: string;
        provider: string;
        deadline: string;
        score: number;
        scoreBreakdown: ScoreBreakdownItem[];
      }[];
    }
  | {
      type: "checklist";
      id: string;
      title: string;
      items: { id: string; label: string; required: boolean }[];
    }
  | { type: "steps"; id: string; title: string; steps: { title: string; description: string }[] }
  | { type: "notice"; id: string; text: string };

export function benefitSearchToA2UI(
  response: BenefitSearchResponse,
  detail: BenefitDetail,
  personas: DemoPersonaPreset[],
  deadlines: UpcomingDeadlinesResponse
): A2UIBlock[] {
  return [
    {
      type: "section",
      id: "query-summary",
      title: `"${response.query}" 검색 결과`,
      tone: "default"
    },
    {
      type: "persona-selector",
      id: "persona-selector",
      title: "추천 페르소나",
      activePersona: response.profile.persona,
      personas: personas.map((persona) => ({
        id: persona.id,
        label: personaLabel(persona.id),
        description: persona.description,
        weights: persona.weights
      }))
    },
    ...response.results.map(
      (result): A2UIBlock => ({
        type: "benefit-card",
        id: result.id,
        title: result.title,
        provider: result.provider,
        status: result.status,
        summary: result.summary,
        score: result.score,
        scoreBreakdown: result.scoreBreakdown,
        reasons: result.reasons,
        missingInfo: result.missingInfo
      })
    ),
    {
      type: "deadlines",
      id: "upcoming-deadlines",
      title: `다가오는 신청 마감 (${deadlines.withinDays ?? "전체"}일)`,
      items: deadlines.results.map((result) => ({
        id: result.id,
        title: result.title,
        provider: result.provider,
        deadline: result.applicationDeadline,
        score: result.score,
        scoreBreakdown: result.scoreBreakdown
      }))
    },
    {
      type: "checklist",
      id: `${detail.id}-checklist`,
      title: "신청 준비 체크리스트",
      items: detail.documents.map((document) => ({
        id: document.id,
        label: document.label,
        required: document.required
      }))
    },
    {
      type: "steps",
      id: `${detail.id}-guide`,
      title: "신청 단계 가이드",
      steps: [
        { title: "대상 조건 확인", description: detail.target },
        { title: "마감일 확인", description: formatDeadline(detail.applicationDeadline) },
        { title: "준비물 확인", description: "필수 서류와 추가 확인 조건을 점검합니다." },
        { title: "공식 경로 이동", description: detail.applicationUrl ?? detail.sourceUrl }
      ]
    },
    {
      type: "notice",
      id: "safety",
      text: "이 도구는 확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다."
    }
  ];
}

export function personaLabel(persona: RecommendationPersona): string {
  const labels: Record<RecommendationPersona, string> = {
    youth_jobseeker: "청년 구직자",
    university_student: "대학생",
    newlywed_family: "신혼가구",
    single_parent: "한부모 가구",
    senior: "시니어",
    general: "일반"
  };
  return labels[persona];
}

export function formatDeadline(deadline?: string): string {
  if (!deadline) return "마감일은 공고문에서 확인해야 합니다.";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(deadline));
}
