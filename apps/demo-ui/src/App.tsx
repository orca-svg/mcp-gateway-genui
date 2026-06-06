import { benefitSearchToA2UI, type A2UIBlock } from "./a2ui";
import { demoBenefitDetail, demoSearchResponse } from "./demo-data";
import "./styles.css";

const blocks = benefitSearchToA2UI(demoSearchResponse, demoBenefitDetail);

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
