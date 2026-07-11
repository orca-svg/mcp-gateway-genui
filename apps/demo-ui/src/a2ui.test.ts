import { describe, expect, it } from "vitest";
import { HostileDisplayTextFixtureSchema } from "@mcp-gen-ui/schema";
import hostileJson from "@mcp-gen-ui/schema/fixtures/v2/hostile-display-text.json";
import { scenarioView } from "./a2ui";
import { demoScenarios, type DemoScenario } from "./demo-data";

describe("prompt-injection-safe consumer projection", () => {
  it("keeps IDs, order, component data, and actions invariant under hostile display text", () => {
    const normalScenario = demoScenarios[0]!;
    const hostileFixture = HostileDisplayTextFixtureSchema.parse(hostileJson);
    const hostileCandidate = hostileFixture.normalizedResponse.results[0]!;
    const normalDetail = normalScenario.details[hostileCandidate.id]!;
    const hostileScenario: DemoScenario = {
      ...normalScenario,
      search: hostileFixture.normalizedResponse,
      details: {
        [hostileCandidate.id]: {
          ...normalDetail,
          title: hostileCandidate.title,
          summary: hostileCandidate.summary
        }
      }
    };

    const normal = scenarioView(normalScenario, hostileCandidate.id, "");
    const hostile = scenarioView(hostileScenario, hostileCandidate.id, "");
    const structuralProjection = (view: ReturnType<typeof scenarioView>) => ({
      runStatus: view.runStatus,
      cardKeys: view.cards.map((card) => ({
        id: card.id,
        status: card.status,
        score: card.score
      })),
      prep: view.prep && {
        documentIds: view.prep.documents.map((document) => document.id),
        stepIds: view.prep.steps.map((step) => step.id),
        sourceLink: view.prep.sourceLink
      },
      sourceIds: view.sources.map((source) => source.id),
      tools: view.traces.map((trace) => trace.tool)
    });

    expect(structuralProjection(hostile)).toEqual(structuralProjection(normal));
    expect(hostile.cards[0]?.title).not.toBe(normal.cards[0]?.title);
    expect(JSON.stringify(hostile)).not.toContain(hostileFixture.raw.fakeGovernmentUrl);
  });

  it("renders an explicit compatibility fallback for unsupported schema versions", () => {
    const incompatible = structuredClone(demoScenarios[0]!) as unknown as {
      search: { schemaVersion: string };
    };
    incompatible.search.schemaVersion = "benefit-search.v999";

    const view = scenarioView(
      incompatible as unknown as DemoScenario,
      "fixture:benefit-001",
      ""
    );
    expect(view.runStatus).toBe("failed");
    expect(view.compatibilityError).toMatch(/schemaVersion/);
    expect(view.cards).toEqual([]);
    expect(view.prep).toBeNull();
  });
});
