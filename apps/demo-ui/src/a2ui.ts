import type { DemoScenario, DemoSource, DemoToolTrace } from "./demo-data";

/**
 * domain JSON -> A2UI adapter.
 *
 * Keeping this mapping separate from the renderer means the same MCP responses
 * can drive different UI front-ends; the React demo is just one renderer of
 * these transport-neutral blocks. A `DemoScenario` bundles one full gateway run.
 */
export type RunStatus = "success" | "partial" | "failed";

export type A2UIBlock =
  | { type: "section"; id: string; title: string }
  | { type: "run-status"; id: string; query: string; status: RunStatus }
  | {
      type: "benefit-card";
      id: string;
      title: string;
      provider: string;
      status: string;
      summary: string;
      score: number;
      reasons: string[];
      missingInfo: string[];
    }
  | {
      type: "checklist";
      id: string;
      title: string;
      items: { id: string; label: string; required: boolean }[];
    }
  | { type: "steps"; id: string; title: string; steps: { title: string; description: string }[] }
  | {
      type: "deadlines";
      id: string;
      title: string;
      items: { id: string; title: string; deadline: string }[];
    }
  | {
      type: "personas";
      id: string;
      title: string;
      items: { id: string; description: string; active: boolean }[];
    }
  | { type: "source-list"; id: string; title: string; items: DemoSource[] }
  | { type: "tool-trace"; id: string; title: string; items: DemoToolTrace[] }
  | { type: "notice"; id: string; text: string };

/** End-of-KST-day deadlines are stored as `…T14:59:59Z`; the UTC date matches the KST date. */
function kstDateLabel(isoDeadline: string): string {
  return isoDeadline.slice(0, 10);
}

export function scenarioToA2UI(scenario: DemoScenario): A2UIBlock[] {
  const { search, detail, deadlines, personas, sources, traces } = scenario;
  const status: RunStatus = sources.some((source) => source.status === "fallback")
    ? "partial"
    : "success";

  return [
    {
      type: "section",
      id: "query-summary",
      title: `"${search.query}" 검색 결과`
    },
    {
      type: "run-status",
      id: "run-status",
      query: search.query,
      status
    },
    ...search.results.map(
      (result): A2UIBlock => ({
        type: "benefit-card",
        id: result.id,
        title: result.title,
        provider: result.provider,
        status: result.status,
        summary: result.summary,
        score: result.score,
        reasons: result.reasons,
        missingInfo: result.missingInfo
      })
    ),
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
        { title: "준비물 확인", description: "필수 서류와 추가 확인 조건을 점검합니다." },
        { title: "공식 경로 이동", description: detail.applicationUrl ?? detail.sourceUrl }
      ]
    },
    ...(deadlines.results.length > 0
      ? [
          {
            type: "deadlines" as const,
            id: "upcoming-deadlines",
            title: "다가오는 신청 마감",
            items: deadlines.results.map((result) => ({
              id: result.id,
              title: result.title,
              deadline: kstDateLabel(result.applicationDeadline)
            }))
          }
        ]
      : []),
    ...(personas.length > 0
      ? [
          {
            type: "personas" as const,
            id: "recommendation-personas",
            title: "추천 페르소나",
            items: personas.map((persona) => ({
              id: persona.id,
              description: persona.description,
              active: persona.id === search.profile.persona
            }))
          }
        ]
      : []),
    {
      type: "source-list",
      id: "data-sources",
      title: "데이터 출처",
      items: sources
    },
    {
      type: "tool-trace",
      id: "tool-trace",
      title: "도구 실행 내역",
      items: traces
    },
    {
      type: "notice",
      id: "safety",
      text: "이 도구는 확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다."
    }
  ];
}
