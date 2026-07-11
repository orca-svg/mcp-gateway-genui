import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  BenefitSearchResponseV2Schema,
  DISPLAY_TEXT_LIMITS,
  GetBenefitDetailResponseSchema,
  HostileDisplayTextFixtureSchema,
  JSON_SCHEMA_CUSTOM_FORMATS,
  ListPersonasResponseSchema,
  StableMcpErrorSchema,
  UpcomingDeadlinesResponseV2Schema,
  normalizeDisplayText
} from "./index.js";
import {
  PUBLIC_JSON_SCHEMA_ARTIFACTS,
  generateJsonSchema
} from "./json-schema.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(packageRoot, "fixtures/v2", name), "utf8"));
}

function ajvValidate(fileName: string, value: unknown): boolean {
  const definition = PUBLIC_JSON_SCHEMA_ARTIFACTS.find(
    (artifact) => artifact.fileName === fileName
  );
  if (!definition) throw new Error(`Missing schema artifact ${fileName}`);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const [name, validate] of Object.entries(JSON_SCHEMA_CUSTOM_FORMATS)) {
    ajv.addFormat(name, { type: "string", validate });
  }
  return ajv.validate(generateJsonSchema(definition), value) as boolean;
}

describe("versioned producer golden fixtures", () => {
  it("validates every success/partial/error fixture with Zod and Ajv 2020", () => {
    const cases = [
      ["search-success.json", BenefitSearchResponseV2Schema, "BenefitSearchResponse.schema.json"],
      ["search-partial.json", BenefitSearchResponseV2Schema, "BenefitSearchResponse.schema.json"],
      ["search-all-sources-failed.json", StableMcpErrorSchema, "StableMcpError.schema.json"],
      ["detail-provenance.json", GetBenefitDetailResponseSchema, "GetBenefitDetailResponse.schema.json"],
      ["deadlines-stale.json", UpcomingDeadlinesResponseV2Schema, "UpcomingDeadlinesResponse.schema.json"],
      ["personas.json", ListPersonasResponseSchema, "ListPersonasResponse.schema.json"]
    ] as const;

    for (const [name, schema, artifact] of cases) {
      const value = fixture(name);
      expect(schema.safeParse(value).success, `${name} should pass Zod`).toBe(true);
      expect(ajvValidate(artifact, value), `${name} should pass Ajv 2020`).toBe(true);
    }
  });

  it("ships partial and all-source-failure states explicitly", () => {
    const partial = BenefitSearchResponseV2Schema.parse(fixture("search-partial.json"));
    const failed = StableMcpErrorSchema.parse(fixture("search-all-sources-failed.json"));

    expect(partial.dataStatus).toMatchObject({ mode: "mixed", partial: true });
    expect(partial.dataStatus.sources.some((source) => source.status === "timeout")).toBe(true);
    expect(failed.error.code).toBe("all_sources_failed");
    expect(failed.dataStatus?.sources.every((source) => source.status !== "ok")).toBe(true);
  });

  it("normalizes hostile raw text while preserving literal instructions and projection invariants", () => {
    const hostile = HostileDisplayTextFixtureSchema.parse(
      fixture("hostile-display-text.json")
    );
    const baseline = BenefitSearchResponseV2Schema.parse(fixture("search-success.json"));
    const normalized = hostile.normalizedResponse;

    expect(hostile.raw.title).toContain("\u200B");
    expect(hostile.raw.title).toContain("ignore previous instructions");
    expect(hostile.raw.title).toContain("<<<SYSTEM>>>");
    expect(hostile.raw.title).toContain("<script>");
    expect(hostile.raw.title).toContain("**markdown**");
    expect(Array.from(hostile.raw.summary).length).toBeGreaterThan(
      DISPLAY_TEXT_LIMITS.summary
    );
    expect(new URL(hostile.raw.fakeGovernmentUrl).hostname).toBe(
      "gov.kr.evil.example"
    );

    expect(normalized.results[0]?.title).toBe(
      normalizeDisplayText(hostile.raw.title, DISPLAY_TEXT_LIMITS.title)
    );
    expect(normalized.results[0]?.summary).toBe(
      normalizeDisplayText(hostile.raw.summary, DISPLAY_TEXT_LIMITS.summary)
    );
    expect(normalized.results[0]?.title).toContain("ignore previous instructions");
    expect(normalized.results[0]?.title).toContain("<script>");

    const projectionInvariant = (response: typeof baseline) => ({
      schemaVersion: response.schemaVersion,
      ids: response.results.map((result) => result.id),
      categories: response.results.map((result) => result.category),
      assessments: response.results.map((result) => result.assessment),
      rankings: response.results.map((result) => result.ranking),
      links: response.results.map((result) => result.links)
    });

    expect(projectionInvariant(normalized)).toEqual(projectionInvariant(baseline));
  });
});
