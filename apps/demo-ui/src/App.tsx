import { useMemo, useState } from "react";
import { scenarioToA2UI, type A2UIBlock, type RunStatus } from "./a2ui";
import { demoScenarios } from "./demo-data";
import type { DemoSourceStatus } from "./demo-data";
import "./styles.css";

export function App() {
  const [activeId, setActiveId] = useState(demoScenarios[0].id);
  const scenario = demoScenarios.find((item) => item.id === activeId) ?? demoScenarios[0];
  const blocks = useMemo(() => scenarioToA2UI(scenario), [scenario]);

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
        <input value={scenario.search.query} readOnly />
        <button type="button">검색</button>
      </section>

      <nav className="scenarios" aria-label="시나리오 선택">
        {demoScenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === activeId ? "active" : undefined}
            aria-pressed={item.id === activeId}
            onClick={() => setActiveId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

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

  if (block.type === "run-status") {
    return (
      <aside className={`run-status ${block.status}`} aria-label="실행 상태">
        <span className="run-dot" aria-hidden="true" />
        <span>{runStatusLabel(block.status)}</span>
      </aside>
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
        <p className="score">적합도 {Math.round(block.score * 100)}%</p>
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

  if (block.type === "deadlines") {
    return (
      <section className="panel" aria-label={block.title}>
        <h3>{block.title}</h3>
        <p className="caption">마감일은 한국 시간(KST) 기준입니다.</p>
        <ul className="deadlines">
          {block.items.map((item) => (
            <li key={item.id}>
              <span>{item.title}</span>
              <strong>마감일 {item.deadline}</strong>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (block.type === "personas") {
    return (
      <section className="panel" aria-label={block.title}>
        <h3>{block.title}</h3>
        <p className="caption">검색 프로필에 적용된 점수 가중치 프리셋입니다.</p>
        <ul className="personas">
          {block.items.map((item) => (
            <li key={item.id} className={item.active ? "active" : undefined}>
              <strong>{item.id}</strong>
              {item.active && <em className="applied">적용됨</em>}
              <span>{item.description}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (block.type === "source-list") {
    return (
      <section className="panel" aria-label={block.title}>
        <h3>{block.title}</h3>
        <p className="caption">공공 데이터 출처와 응답 상태입니다.</p>
        <ul className="sources">
          {block.items.map((item) => (
            <li key={item.id}>
              <div className="source-name">
                <strong>{item.provider}</strong>
                <span>{item.dataset}</span>
              </div>
              <em className={`src-status ${item.status}`}>{sourceStatusLabel(item.status)}</em>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (block.type === "tool-trace") {
    return (
      <section className="panel" aria-label={block.title}>
        <h3>{block.title}</h3>
        <p className="caption">게이트웨이가 호출한 MCP 도구와 응답 시간입니다.</p>
        <ul className="traces">
          {block.items.map((item) => (
            <li key={item.tool}>
              <code>{item.tool}</code>
              <em className={`src-status ${item.status}`}>{sourceStatusLabel(item.status)}</em>
              <strong>{item.durationMs}ms</strong>
            </li>
          ))}
        </ul>
      </section>
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

function statusLabel(status: string): string {
  if (status === "candidate") return "후보";
  if (status === "needs_more_info") return "확인 필요";
  return "부적합";
}

function runStatusLabel(status: RunStatus): string {
  if (status === "success") return "정상 응답";
  if (status === "partial") return "일부 출처 대체(폴백)";
  return "응답 실패";
}

function sourceStatusLabel(status: DemoSourceStatus): string {
  if (status === "ok") return "정상";
  if (status === "cached") return "캐시";
  return "폴백";
}
