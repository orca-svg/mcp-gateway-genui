import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  JSON_SCHEMA_DIALECT,
  PUBLIC_JSON_SCHEMA_ARTIFACTS,
  generatePublicJsonSchemas
} from "./json-schema.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(packageRoot, "schema/v2");

function objectSchemas(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const current = record.type === "object" ? [record] : [];
  return [
    ...current,
    ...Object.values(record).flatMap((child) =>
      Array.isArray(child)
        ? child.flatMap(objectSchemas)
        : objectSchemas(child)
    )
  ];
}

describe("generated JSON Schema artifacts", () => {
  it("publishes generated schemas and versioned fixtures through package exports", () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8")
    ) as Record<string, any>;

    expect(packageJson.files).toEqual(["dist", "schema", "fixtures"]);
    expect(packageJson.exports).toMatchObject({
      "./schema/*": "./schema/*",
      "./fixtures/*": "./fixtures/*"
    });
  });

  it("matches the deterministic checked-in draft 2020-12 output", () => {
    const generated = generatePublicJsonSchemas();
    expect(readdirSync(schemaDir).sort()).toEqual(
      PUBLIC_JSON_SCHEMA_ARTIFACTS.map((artifact) => artifact.fileName).sort()
    );

    for (const definition of PUBLIC_JSON_SCHEMA_ARTIFACTS) {
      const path = join(schemaDir, definition.fileName);
      expect(existsSync(path), definition.fileName).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(
        generated.get(definition.fileName)
      );
    }
  });

  it("uses unique stable IDs and strict objects throughout", () => {
    const schemas = [...generatePublicJsonSchemas().values()];
    expect(new Set(schemas.map((schema) => schema.$id)).size).toBe(schemas.length);

    for (const schema of schemas) {
      expect(schema.$schema).toBe(JSON_SCHEMA_DIALECT);
      expect(schema.$id).toMatch(/^urn:mcp-gen-ui:schema:v2:/);
      for (const objectSchema of objectSchemas(schema)) {
        expect(objectSchema.additionalProperties).toBe(false);
      }
    }
  });

  it("emits the custom query and URL formats", () => {
    const generated = generatePublicJsonSchemas();
    const request = generated.get("BenefitSearchRequest.schema.json");
    const candidate = JSON.stringify(generated.get("BenefitCandidateV2.schema.json"));

    expect((request?.properties as Record<string, any>).query).toMatchObject({
      minLength: 1,
      maxLength: 300,
      format: "normalized-safe-query"
    });
    expect(candidate).toContain('"format":"safe-https-url"');
    expect(candidate).toContain('"format":"safe-public-url"');
    expect(candidate).toContain('"format":"normalized-display-text"');
  });
});
