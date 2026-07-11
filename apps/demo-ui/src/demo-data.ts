import {
  BenefitSearchResponseV2Schema,
  GetBenefitDetailResponseSchema,
  ListPersonasResponseSchema,
  UpcomingDeadlinesResponseV2Schema,
  type BenefitDetail,
  type BenefitSearchResponse,
  type PersonaPreset,
  type SourceObservation,
  type UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";
import searchSuccessJson from "@mcp-gen-ui/schema/fixtures/v2/search-success.json";
import searchPartialJson from "@mcp-gen-ui/schema/fixtures/v2/search-partial.json";
import detailProvenanceJson from "@mcp-gen-ui/schema/fixtures/v2/detail-provenance.json";
import deadlinesStaleJson from "@mcp-gen-ui/schema/fixtures/v2/deadlines-stale.json";
import personasJson from "@mcp-gen-ui/schema/fixtures/v2/personas.json";

/** The browser demo consumes the exact golden contract shipped by schema. */
export type DemoSourceStatus = SourceObservation["status"];

export type DemoSource = {
  id: string;
  provider: string;
  dataset: string;
  status: DemoSourceStatus;
};

export type DemoToolTrace = {
  tool: string;
  status: DemoSourceStatus;
  durationMs: number;
};

export type DemoScenario = {
  id: string;
  label: string;
  search: BenefitSearchResponse;
  details: Record<string, BenefitDetail>;
  deadlines: UpcomingDeadlinesResponse;
  personas: PersonaPreset[];
  sources: DemoSource[];
  traces: DemoToolTrace[];
};

const searchSuccess = BenefitSearchResponseV2Schema.parse(searchSuccessJson);
const searchPartial = BenefitSearchResponseV2Schema.parse(searchPartialJson);
const detail = GetBenefitDetailResponseSchema.parse(detailProvenanceJson).result;
const deadlines = UpcomingDeadlinesResponseV2Schema.parse(deadlinesStaleJson);
const personas = ListPersonasResponseSchema.parse(personasJson).personas;

function sourcesFor(search: BenefitSearchResponse): DemoSource[] {
  return search.dataStatus.sources.map((source) => ({
    id: source.sourceId,
    provider: source.sourceId,
    dataset: `adapter ${source.adapterVersion}`,
    status: source.status
  }));
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "fixture-success",
    label: "서울 청년 주거",
    search: searchSuccess,
    details: { [detail.id]: detail },
    deadlines,
    personas,
    sources: sourcesFor(searchSuccess),
    traces: [
      { tool: "searchBenefits", status: "ok", durationMs: 42 },
      { tool: "getBenefitDetail", status: "ok", durationMs: 18 },
      { tool: "listPersonas", status: "ok", durationMs: 5 }
    ]
  },
  {
    id: "mixed-partial",
    label: "일부 출처 실패",
    search: searchPartial,
    details: {},
    deadlines,
    personas,
    sources: sourcesFor(searchPartial),
    traces: [
      { tool: "searchBenefits", status: "partial", durationMs: 51 },
      { tool: "getUpcomingDeadlines", status: "timeout", durationMs: 10_000 }
    ]
  }
];
