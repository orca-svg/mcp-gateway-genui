import type { RecommendationWeights, ScoreBreakdownItem } from "@mcp-gen-ui/schema";
import { benefitSearchToA2UI, formatDeadline, type A2UIBlock } from "./a2ui";
import {
  demoBenefitDetail,
  demoPersonas,
  demoSearchResponse,
  demoUpcomingDeadlines
} from "./demo-data";
import "./styles.css";

const blocks = benefitSearchToA2UI(
  demoSearchResponse,
  demoBenefitDetail,
  demoPersonas,
  demoUpcomingDeadlines
);

export function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MCP-Gen UI Gateway</p>
          <h1>공공 혜택 탐색</h1>
        </div>
        <span className="status">Fixture demo</span>
      </header>

      <section className="search-panel" aria-label="자연어 조건 입력">
        <input value="서울 거주 대학생인데 받을 수 있는 지원 있어?" readOnly />
        <button type="button">검색</button>
      </section>

      <section className="grid" aria-label="생성된 UI">
        {blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} />
        ))}
      </section>
    </main>
  );
}

function BlockRenderer({ block }: { block: A2UIBlock }) {
  if (block.type === "section") {
    return <h2 className="section-title">{block.title}</h2>;
  }

  if (block.type === "persona-selector") {
    return (
      <article className="panel persona-panel">
        <div className="card-head">
          <h3>{block.title}</h3>
          <span className="badge">listPersonas fixture</span>
        </div>
        <div className="persona-options" role="listbox" aria-label="페르소나 선택">
          {block.personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              className={persona.id === block.activePersona ? "persona active" : "persona"}
              aria-pressed={persona.id === block.activePersona}
            >
              <strong>{persona.label}</strong>
              <span>{persona.description}</span>
              <small>{formatWeights(persona.weights)}</small>
            </button>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === "benefit-card") {
    return (
      <article className={`benefit-card ${block.status}`}>
        <div className="card-head">
          <div>
            <p className="provider">{block.provider}</p>
            <h3>{block.title}</h3>
          </div>
          <span className="badge">{statusLabel(block.status)}</span>
        </div>
        <ScoreMeter score={block.score} breakdown={block.scoreBreakdown} />
        <p>{block.summary}</p>
        <ul>
          {block.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
          {block.missingInfo.map((item) => (
            <li key={item}>확인 필요: {item}</li>
          ))}
        </ul>
      </article>
    );
  }

  if (block.type === "deadlines") {
    return (
      <article className="panel deadlines-panel">
        <h3>{block.title}</h3>
        <ul className="deadline-list">
          {block.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.provider}</span>
                <small>마감: {formatDeadline(item.deadline)}</small>
              </div>
              <ScoreMeter score={item.score} breakdown={item.scoreBreakdown} compact />
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (block.type === "checklist") {
    return (
      <article className="panel">
        <h3>{block.title}</h3>
        <ul className="checklist">
          {block.items.map((item) => (
            <li key={item.id}>
              <input type="checkbox" readOnly />
              <span>{item.label}</span>
              {item.required && <strong>필수</strong>}
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (block.type === "steps") {
    return (
      <article className="panel">
        <h3>{block.title}</h3>
        <ol className="steps">
          {block.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </li>
          ))}
        </ol>
      </article>
    );
  }

  return <aside className="notice">{block.text}</aside>;
}

function ScoreMeter({
  score,
  breakdown,
  compact = false
}: {
  score: number;
  breakdown: ScoreBreakdownItem[];
  compact?: boolean;
}) {
  const percentage = Math.round(score * 100);

  return (
    <div className={compact ? "score-meter compact" : "score-meter"}>
      <div className="score-row">
        <span>추천 점수</span>
        <strong>{percentage}점</strong>
      </div>
      <div className="score-track" aria-label={`추천 점수 ${percentage}점`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
      {!compact && (
        <dl className="score-breakdown">
          {breakdown.map((item) => (
            <div key={`${item.dimension}-${item.explanation}`}>
              <dt>{dimensionLabel(item.dimension)}</dt>
              <dd>
                {item.explanation} (신호 {item.signal}, 가중치 {item.weight})
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "candidate") return "후보";
  if (status === "needs_more_info") return "확인 필요";
  return "부적합";
}

function dimensionLabel(dimension: ScoreBreakdownItem["dimension"]): string {
  const labels: Record<ScoreBreakdownItem["dimension"], string> = {
    region: "지역",
    age: "연령",
    student: "학생",
    employment: "고용",
    household: "가구",
    category: "분야",
    query: "검색어"
  };
  return labels[dimension];
}

function formatWeights(weights: Required<RecommendationWeights>): string {
  return `학생 ${weights.student} · 연령 ${weights.age} · 분야 ${weights.category}`;
}
