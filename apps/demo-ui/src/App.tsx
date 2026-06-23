import { useMemo, useState } from "react";
import { scenarioView, type RunStatus } from "./a2ui";
import { demoScenarios, type DemoSourceStatus } from "./demo-data";
import "./styles.css";

export function App() {
  const [activeId, setActiveId] = useState(demoScenarios[0].id);
  const scenario = demoScenarios.find((item) => item.id === activeId) ?? demoScenarios[0];
  const [selectedId, setSelectedId] = useState(scenario.search.results[0].id);
  const [filter, setFilter] = useState("");

  const view = useMemo(
    () => scenarioView(scenario, selectedId, filter),
    [scenario, selectedId, filter]
  );

  const selectScenario = (id: string) => {
    const next = demoScenarios.find((item) => item.id === id) ?? demoScenarios[0];
    setActiveId(id);
    setSelectedId(next.search.results[0].id);
    setFilter("");
  };

  return (
    <main className="shell">
      <div className="gov-strip">
        <span className="korea-mark" aria-hidden="true" />
        공공 혜택 탐색 GenUI 데모 · MCP-Gen UI Gateway
      </div>

      <header className="topbar">
        <div>
          <p className="eyebrow">MCP-Gen UI Gateway</p>
          <h1>공공 혜택 탐색</h1>
        </div>
        <span className="status">Fixture demo</span>
      </header>

      <div className="areas">
        <section className="area input-area" aria-label="입력 및 조건">
          <h2 className="area-title">입력 · 조건</h2>
          <div className="search-panel">
            <input
              aria-label="검색 조건"
              value={filter}
              placeholder={view.query}
              onChange={(event) => setFilter(event.target.value)}
            />
            <button type="button">검색</button>
          </div>
          <div className="scenarios" role="group" aria-label="시나리오 선택">
            {demoScenarios.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeId ? "active" : undefined}
                aria-pressed={item.id === activeId}
                onClick={() => selectScenario(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {view.personaId && (
            <p className="persona-tag">
              적용 페르소나: <strong>{view.personaId}</strong>
              {view.personaDescription ? ` — ${view.personaDescription}` : ""}
            </p>
          )}
          <p className={`run-line ${view.runStatus}`}>
            <span className="run-dot" aria-hidden="true" />
            {runStatusLabel(view.runStatus)}
          </p>
        </section>

        <section className="area results-area" aria-label="추천 결과">
          <h2 className="area-title">&quot;{view.query}&quot; 추천 결과</h2>
          <ul className="cards">
            {view.cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  aria-label={card.title}
                  aria-pressed={card.id === selectedId}
                  className={`benefit-card ${card.status} ${card.id === selectedId ? "selected" : ""}`}
                  onClick={() => setSelectedId(card.id)}
                >
                  <span className="provider">{card.provider}</span>
                  <span className="card-title">{card.title}</span>
                  <span className="badge">{statusLabel(card.status)}</span>
                  <span className="score">적합도 {Math.round(card.score * 100)}%</span>
                  <span className="card-summary">{card.summary}</span>
                </button>
              </li>
            ))}
            {view.cards.length === 0 && (
              <li className="empty">검색 조건에 맞는 결과가 없습니다.</li>
            )}
          </ul>
        </section>

        <section className="area prep-area" aria-label="신청 준비">
          <h2 className="area-title">신청 준비</h2>
          {view.prep ? (
            <>
              <h3 className="prep-title">{view.prep.title}</h3>
              {view.prep.deadline && (
                <p className="prep-deadline">
                  마감일 {view.prep.deadline}
                  <span className="caption"> · 한국 시간(KST) 기준</span>
                </p>
              )}
              <h4>준비 서류</h4>
              <ul className="checklist">
                {view.prep.documents.map((document) => (
                  <li key={document.id}>
                    <input type="checkbox" readOnly />
                    <span>{document.label}</span>
                    {document.required && <strong>필수</strong>}
                  </li>
                ))}
              </ul>
              <h4>신청 단계</h4>
              <ol className="steps">
                {view.prep.steps.map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </li>
                ))}
              </ol>
              <a
                className="source-link"
                href={view.prep.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                공식 페이지로 이동 ↗
              </a>
            </>
          ) : (
            <p>선택한 항목의 상세가 없습니다.</p>
          )}
        </section>
      </div>

      <aside className="notice">
        이 도구는 확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다.
      </aside>

      <details className="transparency">
        <summary>데이터 출처 · 동작 내역</summary>
        <div className="transparency-body">
          <div>
            <h3>데이터 출처</h3>
            <ul className="sources">
              {view.sources.map((source) => (
                <li key={source.id}>
                  <div className="source-name">
                    <strong>{source.provider}</strong>
                    <span>{source.dataset}</span>
                  </div>
                  <em className={`src-status ${source.status}`}>
                    {sourceStatusLabel(source.status)}
                  </em>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>도구 실행 내역</h3>
            <ul className="traces">
              {view.traces.map((trace) => (
                <li key={trace.tool}>
                  <code>{trace.tool}</code>
                  <em className={`src-status ${trace.status}`}>{sourceStatusLabel(trace.status)}</em>
                  <strong>{trace.durationMs}ms</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </main>
  );
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
