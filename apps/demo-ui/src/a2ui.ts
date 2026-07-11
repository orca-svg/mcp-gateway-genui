import type { VerifiedLink } from "@mcp-gen-ui/schema";
import type { DemoScenario, DemoSource, DemoToolTrace } from "./demo-data";

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
  steps: { id: string; title: string; description: string }[];
  deadline?: string;
  sourceLink?: Pick<VerifiedLink, "url" | "health">;
};

export type ScenarioView = {
  query: string;
  personaId?: string;
  personaDescription?: string;
  runStatus: RunStatus;
  compatibilityError?: string;
  cards: CardVM[];
  prep: PrepVM | null;
  sources: DemoSource[];
  traces: DemoToolTrace[];
};

function kstDateLabel(isoDeadline: string): string {
  return isoDeadline.slice(0, 10);
}

function runStatusOf(scenario: DemoScenario): RunStatus {
  const sources = scenario.search.dataStatus.sources;
  const hasSuccess = sources.some(
    (source) => source.status === "ok" || source.status === "partial"
  );
  if (!hasSuccess) return "failed";
  if (scenario.search.dataStatus.partial || sources.some((source) => source.status !== "ok")) {
    return "partial";
  }
  return "success";
}

function preferredOfficialLink(links: VerifiedLink[]): VerifiedLink | undefined {
  return links
    .filter((link) => link.official && link.url.startsWith("https://"))
    .sort((left, right) => {
      const relation = Number(right.rel === "apply") - Number(left.rel === "apply");
      if (relation !== 0) return relation;
      const healthRank = { verified: 0, stale: 1, unchecked: 2, unreachable: 3 };
      return healthRank[left.health] - healthRank[right.health];
    })[0];
}

export function scenarioView(
  scenario: DemoScenario,
  selectedId: string,
  filter: string
): ScenarioView {
  if ((scenario.search as { schemaVersion?: unknown }).schemaVersion !== "benefit-search.v2") {
    return {
      query: "지원되지 않는 게이트웨이 응답",
      runStatus: "failed",
      compatibilityError: "지원하지 않는 schemaVersion입니다. 게이트웨이와 소비자 버전을 확인하세요.",
      cards: [],
      prep: null,
      sources: scenario.sources,
      traces: scenario.traces
    };
  }

  const { search, details, deadlines, personas, sources, traces } = scenario;
  const term = filter.trim();
  const cards: CardVM[] = search.results
    .filter(
      (result) =>
        term.length === 0 || result.title.includes(term) || result.summary.includes(term)
    )
    .map((result) => ({
      id: result.id,
      title: result.title,
      provider: result.provider,
      status: result.assessment.status,
      summary: result.summary,
      score: result.ranking.score,
      reasons: result.assessment.constraints.map((constraint) => constraint.explanation),
      missingInfo: result.assessment.missingInfo
    }));

  const detail = details[selectedId];
  const deadline = deadlines.results.find((item) => item.id === selectedId)?.applicationDeadline;
  const actionLink = detail ? preferredOfficialLink(detail.links) : undefined;
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
          { id: "verify-criteria", title: "대상 조건 확인", description: detail.target },
          {
            id: "prepare-documents",
            title: "준비물 확인",
            description: "필수 서류와 추가 확인 조건을 점검합니다."
          },
          {
            id: "open-structured-link",
            title: "공식 경로 이동",
            description: "검증 상태가 표시된 구조화 링크에서 최신 공고를 확인하세요."
          }
        ],
        deadline: deadline ? kstDateLabel(deadline) : undefined,
        sourceLink: actionLink
          ? { url: actionLink.url, health: actionLink.health }
          : undefined
      }
    : null;

  const personaId = search.profile.persona;
  const personaDescription = personas.find((persona) => persona.id === personaId)?.description;

  return {
    query: search.query,
    personaId,
    personaDescription,
    runStatus: runStatusOf(scenario),
    cards,
    prep,
    sources,
    traces
  };
}
