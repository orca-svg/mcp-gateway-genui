import { z } from "zod";
import {
  ApplicationGuideResponseSchema,
  BenefitCandidateV2Schema,
  BenefitRecordSchema,
  BenefitSearchRequestSchema,
  BenefitSearchResponseV2Schema,
  BuildChecklistRequestSchema,
  ChecklistResponseSchema,
  GetApplicationGuideRequestSchema,
  GetBenefitDetailRequestSchema,
  GetBenefitDetailResponseSchema,
  GetChangeLogRequestSchema,
  GetChangeLogResponseSchema,
  ListPersonasRequestSchema,
  ListPersonasResponseSchema,
  StableMcpErrorSchema,
  UpcomingDeadlinesRequestSchema,
  UpcomingDeadlinesResponseV2Schema
} from "./index.js";

export const JSON_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const;

export type PublicJsonSchemaArtifact = {
  fileName: string;
  id: string;
  schema: z.ZodType;
};

function artifact(fileName: string, schema: z.ZodType): PublicJsonSchemaArtifact {
  return {
    fileName,
    id: `urn:mcp-gen-ui:schema:v2:${fileName.replace(/\.schema\.json$/, "")}`,
    schema
  };
}

/** Every public MCP input/output plus the shared candidate/error contracts. */
export const PUBLIC_JSON_SCHEMA_ARTIFACTS = [
  artifact("BenefitSearchRequest.schema.json", BenefitSearchRequestSchema),
  artifact("BenefitSearchResponse.schema.json", BenefitSearchResponseV2Schema),
  artifact("GetBenefitDetailRequest.schema.json", GetBenefitDetailRequestSchema),
  artifact("GetBenefitDetailResponse.schema.json", GetBenefitDetailResponseSchema),
  artifact("UpcomingDeadlinesRequest.schema.json", UpcomingDeadlinesRequestSchema),
  artifact("UpcomingDeadlinesResponse.schema.json", UpcomingDeadlinesResponseV2Schema),
  artifact("ListPersonasRequest.schema.json", ListPersonasRequestSchema),
  artifact("ListPersonasResponse.schema.json", ListPersonasResponseSchema),
  artifact("BuildChecklistRequest.schema.json", BuildChecklistRequestSchema),
  artifact("ChecklistResponse.schema.json", ChecklistResponseSchema),
  artifact("GetApplicationGuideRequest.schema.json", GetApplicationGuideRequestSchema),
  artifact("ApplicationGuideResponse.schema.json", ApplicationGuideResponseSchema),
  artifact("GetChangeLogRequest.schema.json", GetChangeLogRequestSchema),
  artifact("GetChangeLogResponse.schema.json", GetChangeLogResponseSchema),
  artifact("BenefitCandidateV2.schema.json", BenefitCandidateV2Schema),
  artifact("BenefitRecord.schema.json", BenefitRecordSchema),
  artifact("StableMcpError.schema.json", StableMcpErrorSchema)
] as const;

export type GeneratedJsonSchema = Record<string, unknown> & {
  $schema: typeof JSON_SCHEMA_DIALECT;
  $id: string;
};

export function generateJsonSchema(
  definition: PublicJsonSchemaArtifact
): GeneratedJsonSchema {
  const generated = z.toJSONSchema(definition.schema, {
    target: "draft-2020-12",
    io: "input",
    reused: "ref",
    unrepresentable: "throw"
  }) as Record<string, unknown>;

  return {
    ...generated,
    $schema: JSON_SCHEMA_DIALECT,
    $id: definition.id
  };
}

export function generatePublicJsonSchemas(): Map<string, GeneratedJsonSchema> {
  return new Map(
    PUBLIC_JSON_SCHEMA_ARTIFACTS.map((definition) => [
      definition.fileName,
      generateJsonSchema(definition)
    ])
  );
}
