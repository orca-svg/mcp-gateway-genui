import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  ApplicationGuideResponseSchema,
  BenefitDetailSchema,
  BenefitSearchRequestSchema,
  BenefitSearchResponseSchema,
  ChangeLogResponseSchema,
  ChecklistResponseSchema
} from "./index.js";

/**
 * Exports the public contracts as JSON Schema so non-TypeScript clients can
 * validate the same tool inputs/outputs. Run with `pnpm schemas`.
 */
const schemas = {
  BenefitSearchRequest: BenefitSearchRequestSchema,
  BenefitSearchResponse: BenefitSearchResponseSchema,
  BenefitDetail: BenefitDetailSchema,
  ChecklistResponse: ChecklistResponseSchema,
  ApplicationGuideResponse: ApplicationGuideResponseSchema,
  ChangeLogResponse: ChangeLogResponseSchema
};

const outDir = join(process.cwd(), "schema");
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(
    join(outDir, `${name}.schema.json`),
    `${JSON.stringify(zodToJsonSchema(schema, name), null, 2)}\n`
  );
  console.log(`exported schema/${name}.schema.json`);
}
