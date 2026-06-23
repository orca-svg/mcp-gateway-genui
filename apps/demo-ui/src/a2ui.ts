import type { DemoScenario, DemoSource, DemoToolTrace } from "./demo-data";

/**
 * domain JSON -> A2UI view model.
 *
 * Keeping this mapping separate from the renderer means the same MCP responses
 * can drive different front-ends. `scenarioView` projects one gateway run into
 * the three presentation areas (input / results / application prep) plus a
 * demoted transparency surface, all from real `@mcp-gen-ui` schema objects.
 */
export type RunStatus = "success" | "partial" | "failed";

export type CardVM = {
  id: string;
  title: string;
  provider: string;
  status: string;
  summary: string;
  score: number;
  reasons: string[];
  missingInfo: string[];
};

export type PrepVM = {
  title: string;
  target: string;
  documents: { id: string; label: string; required: boolean }[];
  steps: { title: string; description: string }[];
  deadline?: string;
};

export type ScenarioView = {
  query: string;
  personaId?: string;
  personaDescription?: string;
  runStatus: RunStatus;
  cards: CardVM[];
  prep: PrepVM | null;
  sources: DemoSource[];
  traces: DemoToolTrace[];
};

/** End-of-KST-day deadlines are stored as `…T14:59:59Z`; the UTC date matches the KST date. */
function kstDateLabel(isoDeadline: string): string {
  return isoDeadline.slice(0, 10);
}

function runStatusOf(sources: DemoSource[]): RunStatus {
  return sources.some((source) => source.status === "fallback") ? "partial" : "success";
}

export function scenarioView(
  scenario: DemoScenario,
  selectedId: string,
  filter: string
): ScenarioView {
  const { search, details, deadlines, personas, sources, traces } = scenario;
  const term = filter.trim();

  const cards: CardVM[] = search.results
    .filter(
      (result) =>
        term.length === 0 ||
        result.title.includes(term) ||
        result.summary.includes(term)
    )
    .map((result) => ({
      id: result.id,
      title: result.title,
      provider: result.provider,
      status: result.status,
      summary: result.summary,
      score: result.score,
      reasons: result.reasons,
      missingInfo: result.missingInfo
    }));

  const detail = details[selectedId];
  const deadline = deadlines.results.find((item) => item.id === selectedId)?.applicationDeadline;
  const prep: PrepVM | null = detail
    ? {
        title: detail.title,
        target: detail.target,
        documents: detail.documents.map((document) => ({
          id: document.id,
          label: document.label,
          required: document.required
        })),
        steps: [
          { title: "대상 조건 확인", description: detail.target },
          { title: "준비물 확인", description: "필수 서류와 추가 확인 조건을 점검합니다." },
          { title: "공식 경로 이동", description: detail.applicationUrl ?? detail.sourceUrl }
        ],
        deadline: deadline ? kstDateLabel(deadline) : undefined
      }
    : null;

  const personaId = search.profile.persona;
  const personaDescription = personas.find((persona) => persona.id === personaId)?.description;

  return {
    query: search.query,
    personaId,
    personaDescription,
    runStatus: runStatusOf(sources),
    cards,
    prep,
    sources,
    traces
  };
}
