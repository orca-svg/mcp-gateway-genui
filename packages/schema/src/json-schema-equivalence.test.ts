import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  BenefitSearchRequestSchema,
  BenefitSearchResponseV2Schema,
  GetChangeLogRequestSchema,
  JSON_SCHEMA_CUSTOM_FORMATS,
  UpcomingDeadlinesRequestSchema
} from "./index.js";
import {
  PUBLIC_JSON_SCHEMA_ARTIFACTS,
  generateJsonSchema
} from "./json-schema.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(packageRoot, "fixtures/v2", name), "utf8"));
}

function ajv2020() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const [name, validate] of Object.entries(JSON_SCHEMA_CUSTOM_FORMATS)) {
    ajv.addFormat(name, { type: "string", validate });
  }
  return ajv;
}

function compiled(fileName: string) {
  const definition = PUBLIC_JSON_SCHEMA_ARTIFACTS.find(
    (artifact) => artifact.fileName === fileName
  );
  if (!definition) throw new Error(`Missing schema artifact ${fileName}`);
  return ajv2020().compile(generateJsonSchema(definition));
}

function expectEquivalent(
  schema: { safeParse(value: unknown): { success: boolean } },
  validate: ReturnType<ReturnType<typeof ajv2020>["compile"]>,
  values: unknown[]
) {
  for (const value of values) {
    const zodAccepted = schema.safeParse(value).success;
    const jsonSchemaAccepted = validate(value) as boolean;
    expect(
      jsonSchemaAccepted,
      `Zod=${zodAccepted}; Ajv errors=${JSON.stringify(validate.errors)}`
    ).toBe(zodAccepted);
  }
}

describe("Zod / JSON Schema 2020-12 equivalence", () => {
  it("agrees on defaults, unknown keys, query policy, bounds, and enums", () => {
    const validate = compiled("BenefitSearchRequest.schema.json");
    expectEquivalent(BenefitSearchRequestSchema, validate, [
      { query: "지원" },
      { query: "지원", profile: {}, weights: {} },
      { query: "지원", email: "person@example.test" },
      { query: "지원", profile: { residentNumber: "000000-0000000" } },
      { query: " 검색 " },
      { query: "청년\u200B지원" },
      { query: "e\u0301" },
      { query: "😀".repeat(300) },
      { query: "😀".repeat(301) },
      { query: "지원", profile: { regionCode: "KR-11", ageBand: "twenties" } },
      { query: "지원", profile: { regionCode: "서울", ageBand: "twenties" } },
      { query: "지원", weights: { query: 0, region: 10 } },
      { query: "지원", weights: { query: -1 } },
      { query: "지원", weights: { query: 10.1 } }
    ]);
  });

  it("agrees on deadline bounds and change-log cursor limits", () => {
    expectEquivalent(
      UpcomingDeadlinesRequestSchema,
      compiled("UpcomingDeadlinesRequest.schema.json"),
      [
        {},
        { withinDays: 1 },
        { withinDays: 365 },
        { withinDays: 0 },
        { withinDays: 366 },
        { withinDays: 1.5 },
        { profile: { regionCode: "KR-26" } },
        { profile: { detailedAddress: "부산광역시 해운대구" } }
      ]
    );

    expectEquivalent(GetChangeLogRequestSchema, compiled("GetChangeLogRequest.schema.json"), [
      {},
      { entityId: "benefit-1", limit: 1 },
      { entityId: "benefit-1", cursor: "c29tZS1jdXJzb3I", limit: 100 },
      { entityId: "bad id" },
      { cursor: "not+a+cursor" },
      { limit: 0 },
      { limit: 101 }
    ]);
  });

  it("agrees on nested strictness, URL formats, enums, and date-time formats", () => {
    const valid = readFixture("search-success.json") as Record<string, unknown>;
    const clone = () => JSON.parse(JSON.stringify(valid)) as Record<string, any>;
    const unknownCandidate = clone();
    unknownCandidate.results[0].email = "person@example.test";
    const badUrl = clone();
    badUrl.results[0].links[0].url = "javascript:alert(1)";
    const httpOfficial = clone();
    httpOfficial.results[0].links[0].url = "http://www.gov.kr/item";
    const badStatus = clone();
    badStatus.results[0].assessment.status = "not_applicable";
    const badDateTime = clone();
    badDateTime.generatedAt = "July 10, 2026";

    expectEquivalent(
      BenefitSearchResponseV2Schema,
      compiled("BenefitSearchResponse.schema.json"),
      [valid, unknownCandidate, badUrl, httpOfficial, badStatus, badDateTime]
    );
  });
});
