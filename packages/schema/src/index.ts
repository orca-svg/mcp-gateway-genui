import { z } from "zod";
import {
  NORMALIZED_DISPLAY_TEXT_FORMAT,
  NORMALIZED_QUERY_FORMAT,
  OPAQUE_ID_PATTERN,
  QUERY_MAX_LENGTH,
  QUERY_POLICY_DESCRIPTION,
  SAFE_HTTPS_URL_FORMAT,
  SAFE_PUBLIC_URL_FORMAT,
  ZERO_SUM_WEIGHT_BEHAVIOR,
  isNormalizedDisplayText,
  isNormalizedQuery,
  isSafeHttpsUrl,
  isSafePublicUrl
} from "./text.js";

export * from "./text.js";

/**
 * Strict v2 public contract for the source-aware candidate gateway.
 *
 * Zod is the TypeScript source of truth. `export-json-schema.ts` emits the
 * corresponding JSON Schema draft 2020-12 artifacts used by MCP consumers.
 */

export const BENEFIT_SEARCH_SCHEMA_VERSION = "benefit-search.v2" as const;
export const BENEFIT_DETAIL_SCHEMA_VERSION = "benefit-detail.v2" as const;
export const UPCOMING_DEADLINES_SCHEMA_VERSION = "upcoming-deadlines.v2" as const;
export const PERSONA_LIST_SCHEMA_VERSION = "persona-list.v2" as const;
export const CHECKLIST_SCHEMA_VERSION = "application-checklist.v2" as const;
export const APPLICATION_GUIDE_SCHEMA_VERSION = "application-guide.v2" as const;
export const CHANGE_LOG_SCHEMA_VERSION = "benefit-change-log.v2" as const;
export const MCP_ERROR_SCHEMA_VERSION = "mcp-error.v1" as const;

export const DISPLAY_TEXT_LIMITS = {
  title: 200,
  provider: 160,
  summary: 2_000,
  explanation: 1_000,
  short: 300,
  long: 4_000,
  searchable: 10_000
} as const;

function normalizedDisplayTextSchema(maxLength: number, minLength = 1) {
  return z
    .string()
    .refine(
      (value) => {
        const length = Array.from(value).length;
        return length >= minLength && length <= maxLength;
      },
      { message: `Display text must contain ${minLength}..${maxLength} Unicode code points.` }
    )
    .refine(isNormalizedDisplayText, {
      message: "Display text must be NFC-normalized and contain no control, zero-width, or bidi-control characters."
    })
    .meta({
      format: NORMALIZED_DISPLAY_TEXT_FORMAT,
      minLength,
      maxLength
    });
}

export const NormalizedQuerySchema = z
  .string()
  .refine(isNormalizedQuery, { message: QUERY_POLICY_DESCRIPTION })
  .describe(QUERY_POLICY_DESCRIPTION)
  .meta({
    format: NORMALIZED_QUERY_FORMAT,
    minLength: 1,
    maxLength: QUERY_MAX_LENGTH
  });

export const OpaqueIdSchema = z
  .string()
  .regex(OPAQUE_ID_PATTERN, "Expected an opaque ID matching the public ID grammar.");

export const StableCodeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const VersionStringSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/);

export const DateTimeSchema = z.iso.datetime({ offset: true });
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const JsonPointerSchema = z
  .string()
  .max(512)
  .regex(/^(?:\/(?:[^~/]|~0|~1)*)*$/);
export const CursorSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);

export const HttpsUrlSchema = z
  .string()
  .max(2_048)
  .refine(isSafeHttpsUrl, {
    message: "Expected an HTTPS URL without embedded credentials."
  })
  .meta({ format: SAFE_HTTPS_URL_FORMAT });

export const PublicUrlSchema = z
  .string()
  .max(2_048)
  .refine(isSafePublicUrl, {
    message: "Expected an HTTP(S) URL without embedded credentials."
  })
  .meta({ format: SAFE_PUBLIC_URL_FORMAT });

export const BenefitCategorySchema = z.enum([
  "housing",
  "education",
  "employment",
  "health",
  "family",
  "youth",
  "local",
  "other"
]);

/** ISO 3166-2 first-level South Korean region codes. */
export const RegionCodeSchema = z.enum([
  "KR-11",
  "KR-26",
  "KR-27",
  "KR-28",
  "KR-29",
  "KR-30",
  "KR-31",
  "KR-36",
  "KR-41",
  "KR-42",
  "KR-43",
  "KR-44",
  "KR-45",
  "KR-46",
  "KR-47",
  "KR-48",
  "KR-49"
]);

export const AgeBandSchema = z.enum([
  "teen",
  "twenties",
  "thirties",
  "forties",
  "fifties",
  "sixties_plus"
]);

export const StudentStatusSchema = z.enum(["student", "not_student", "unknown"]);
export const EmploymentStatusSchema = z.enum([
  "employed",
  "self_employed",
  "unemployed",
  "unknown"
]);
export const HouseholdTypeSchema = z.enum([
  "single",
  "couple",
  "family",
  "single_parent",
  "unknown"
]);

const StudentConstraintValueSchema = z.enum(["student", "not_student"]);
const EmploymentConstraintValueSchema = z.enum([
  "employed",
  "self_employed",
  "unemployed"
]);
const HouseholdConstraintValueSchema = z.enum([
  "single",
  "couple",
  "family",
  "single_parent"
]);

export const RecommendationPersonaSchema = z.enum([
  "youth_jobseeker",
  "university_student",
  "newlywed_family",
  "single_parent",
  "senior",
  "general"
]);

export const RecommendationScoreDimensionSchema = z.enum([
  "region",
  "age",
  "student",
  "employment",
  "household",
  "category",
  "query"
]);

export const EligibilityDimensionSchema = z.enum([
  "region",
  "age",
  "student",
  "employment",
  "household"
]);

export const RecommendationWeightValueSchema = z.number().finite().min(0).max(10);

export const RecommendationWeightsSchema = z
  .strictObject({
    region: RecommendationWeightValueSchema.optional(),
    age: RecommendationWeightValueSchema.optional(),
    student: RecommendationWeightValueSchema.optional(),
    employment: RecommendationWeightValueSchema.optional(),
    household: RecommendationWeightValueSchema.optional(),
    category: RecommendationWeightValueSchema.optional(),
    query: RecommendationWeightValueSchema.optional()
  })
  .describe(`Partial per-request overrides. ${ZERO_SUM_WEIGHT_BEHAVIOR}`);

export const EffectiveRecommendationWeightsSchema = z
  .strictObject({
    region: RecommendationWeightValueSchema,
    age: RecommendationWeightValueSchema,
    student: RecommendationWeightValueSchema,
    employment: RecommendationWeightValueSchema,
    household: RecommendationWeightValueSchema,
    category: RecommendationWeightValueSchema,
    query: RecommendationWeightValueSchema
  })
  .describe(ZERO_SUM_WEIGHT_BEHAVIOR);

export const StrictCoarseProfileSchema = z.strictObject({
  regionCode: RegionCodeSchema.optional(),
  ageBand: AgeBandSchema.optional(),
  studentStatus: StudentStatusSchema.default("unknown"),
  employmentStatus: EmploymentStatusSchema.default("unknown"),
  householdType: HouseholdTypeSchema.default("unknown"),
  interests: z.array(BenefitCategorySchema).max(8).default([]),
  persona: RecommendationPersonaSchema.optional()
});

export const ScoreBreakdownItemSchema = z.strictObject({
  dimension: RecommendationScoreDimensionSchema,
  signal: z.number().finite().min(0).max(1),
  weight: RecommendationWeightValueSchema,
  contribution: z.number().finite().min(0).max(10),
  explanation: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.explanation)
});

export const RankingPolicySchema = z.strictObject({
  id: StableCodeSchema,
  version: VersionStringSchema,
  persona: RecommendationPersonaSchema.optional(),
  effectiveWeights: EffectiveRecommendationWeightsSchema,
  scoreMeaning: z.literal("relative_relevance_not_eligibility")
});

export const RankingSchema = z.strictObject({
  score: z.number().finite().min(0).max(1),
  breakdown: z.array(ScoreBreakdownItemSchema).max(32)
});

export const AssessmentStatusSchema = z.enum([
  "candidate",
  "needs_more_info",
  "conflict_detected"
]);
export const ConstraintOutcomeSchema = z.enum(["match", "conflict", "unknown"]);
export const EvidenceBasisSchema = z.enum([
  "authoritative_structured",
  "derived_text",
  "default"
]);

export const AssessmentConstraintSchema = z.strictObject({
  dimension: RecommendationScoreDimensionSchema,
  outcome: ConstraintOutcomeSchema,
  basis: EvidenceBasisSchema,
  ruleId: StableCodeSchema,
  ruleVersion: VersionStringSchema,
  sourceFields: z.array(normalizedDisplayTextSchema(128)).max(32),
  explanation: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.explanation)
});

export const CandidateAssessmentSchema = z.strictObject({
  status: AssessmentStatusSchema,
  constraints: z.array(AssessmentConstraintSchema).max(32),
  missingInfo: z.array(normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short)).max(32)
});

export const SourceObservationStatusSchema = z.enum([
  "ok",
  "partial",
  "timeout",
  "unavailable",
  "invalid_payload"
]);

export const SourceObservationSchema = z.strictObject({
  sourceId: OpaqueIdSchema,
  status: SourceObservationStatusSchema,
  retrievedAt: DateTimeSchema,
  recordCount: z.number().int().min(0).max(1_000_000),
  errorCode: StableCodeSchema.optional(),
  adapterVersion: VersionStringSchema
});

export const DataStatusSchema = z.strictObject({
  mode: z.enum(["fixture", "live", "mixed"]),
  partial: z.boolean(),
  sources: z.array(SourceObservationSchema).min(1).max(64)
});

export const ProvenanceRecordSchema = z.strictObject({
  field: JsonPointerSchema,
  sourceId: OpaqueIdSchema,
  sourceRecordId: normalizedDisplayTextSchema(256),
  authority: EvidenceBasisSchema,
  contentHash: Sha256Schema,
  observedAt: DateTimeSchema,
  sourceRevision: VersionStringSchema.optional(),
  license: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional(),
  attribution: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional()
});

export const LinkRelationSchema = z.enum(["source", "apply"]);
export const LinkHealthSchema = z.enum([
  "verified",
  "stale",
  "unchecked",
  "unreachable"
]);

const LinkMetadataFields = {
  rel: LinkRelationSchema,
  health: LinkHealthSchema,
  verifiedAt: DateTimeSchema.optional(),
  verificationMethod: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional()
} as const;

/**
 * HTTP links may be retained for evidence but can never be marked official.
 * The adapter's exact-origin registry is responsible for choosing the official
 * branch; the schema additionally guarantees that official links use HTTPS.
 */
export const VerifiedLinkSchema = z.discriminatedUnion("official", [
  z.strictObject({
    ...LinkMetadataFields,
    url: HttpsUrlSchema,
    official: z.literal(true)
  }),
  z.strictObject({
    ...LinkMetadataFields,
    url: PublicUrlSchema,
    official: z.literal(false)
  })
]);

export const FreshnessSchema = z.strictObject({
  status: z.enum(["fresh", "stale", "unknown"]),
  observedAt: DateTimeSchema,
  staleAfter: DateTimeSchema.optional()
});

export const BenefitCandidateV2Schema = z.strictObject({
  id: OpaqueIdSchema,
  title: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.title),
  provider: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.provider),
  category: BenefitCategorySchema,
  summary: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.summary),
  assessment: CandidateAssessmentSchema,
  ranking: RankingSchema,
  provenance: z.array(ProvenanceRecordSchema).min(1).max(256),
  links: z.array(VerifiedLinkSchema).min(1).max(16),
  freshness: FreshnessSchema
});

export const ChecklistItemSchema = z.strictObject({
  id: OpaqueIdSchema,
  label: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short),
  required: z.boolean(),
  source: OpaqueIdSchema.optional()
});

export const ApplicationStepSchema = z.strictObject({
  id: OpaqueIdSchema,
  order: z.number().int().min(1).max(100),
  title: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short),
  description: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.long),
  requiresUserAction: z.boolean()
});

const BenefitDetailFields = {
  target: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.long),
  eligibility: z.array(normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.long)).max(64),
  applicationPeriod: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional(),
  applicationDeadline: DateTimeSchema.optional(),
  fee: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional(),
  processingTime: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short).optional(),
  documents: z.array(ChecklistItemSchema).max(128),
  applicationMethods: z.array(normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short)).max(32)
} as const;

export const BenefitDetailSchema = BenefitCandidateV2Schema.extend(BenefitDetailFields);

const BenefitRuleMetadataFields = {
  operator: z.literal("in"),
  basis: EvidenceBasisSchema,
  ruleId: StableCodeSchema,
  ruleVersion: VersionStringSchema,
  sourceFields: z.array(normalizedDisplayTextSchema(128)).max(32),
  explanation: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.explanation)
} as const;

export const BenefitRuleSchema = z.discriminatedUnion("dimension", [
  z.strictObject({
    dimension: z.literal("region"),
    allowedValues: z.array(RegionCodeSchema).min(1).max(17),
    ...BenefitRuleMetadataFields
  }),
  z.strictObject({
    dimension: z.literal("age"),
    allowedValues: z.array(AgeBandSchema).min(1).max(6),
    ...BenefitRuleMetadataFields
  }),
  z.strictObject({
    dimension: z.literal("student"),
    allowedValues: z.array(StudentConstraintValueSchema).min(1).max(2),
    ...BenefitRuleMetadataFields
  }),
  z.strictObject({
    dimension: z.literal("employment"),
    allowedValues: z.array(EmploymentConstraintValueSchema).min(1).max(3),
    ...BenefitRuleMetadataFields
  }),
  z.strictObject({
    dimension: z.literal("household"),
    allowedValues: z.array(HouseholdConstraintValueSchema).min(1).max(4),
    ...BenefitRuleMetadataFields
  })
]);

/** Internal normalized record consumed by assessment/ranking and ingestion. */
export const BenefitRecordSchema = z.strictObject({
  id: OpaqueIdSchema,
  sourceId: OpaqueIdSchema,
  sourceRecordId: normalizedDisplayTextSchema(256),
  sourceRevision: VersionStringSchema,
  contentHash: Sha256Schema,
  title: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.title),
  provider: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.provider),
  category: BenefitCategorySchema,
  summary: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.summary),
  ...BenefitDetailFields,
  constraints: z.array(BenefitRuleSchema).max(32),
  searchableText: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.searchable, 0),
  provenance: z.array(ProvenanceRecordSchema).min(1).max(256),
  links: z.array(VerifiedLinkSchema).min(1).max(16),
  lastFetchedAt: DateTimeSchema
});

/** Result from one concrete source adapter. */
export const AdapterResultSchema = z.strictObject({
  records: z.array(BenefitRecordSchema).max(1_000_000),
  observation: SourceObservationSchema
});

/** Source-aware result exposed by a composed read repository. */
export const BenefitRepositoryResultSchema = z.strictObject({
  records: z.array(BenefitRecordSchema).max(1_000_000),
  dataStatus: DataStatusSchema
});

/** Source-aware point lookup; a missing record is distinct from source failure. */
export const BenefitRepositoryDetailResultSchema = z.strictObject({
  record: BenefitRecordSchema.optional(),
  dataStatus: DataStatusSchema
});

export const SourceSyncBatchSchema = z.strictObject({
  observation: SourceObservationSchema,
  sourceRevision: VersionStringSchema,
  complete: z.boolean(),
  records: z.array(BenefitRecordSchema).max(1_000_000)
});

export const BenefitSearchRequestSchema = z.strictObject({
  query: NormalizedQuerySchema,
  profile: StrictCoarseProfileSchema.prefault({}),
  weights: RecommendationWeightsSchema.default({})
});

export const BenefitSearchResponseV2Schema = z.strictObject({
  schemaVersion: z.literal(BENEFIT_SEARCH_SCHEMA_VERSION),
  query: NormalizedQuerySchema,
  profile: StrictCoarseProfileSchema,
  rankingPolicy: RankingPolicySchema,
  dataStatus: DataStatusSchema,
  results: z.array(BenefitCandidateV2Schema).max(1_000),
  generatedAt: DateTimeSchema
});

export const GetBenefitDetailRequestSchema = z.strictObject({ id: OpaqueIdSchema });
export const GetBenefitDetailResponseSchema = z.strictObject({
  schemaVersion: z.literal(BENEFIT_DETAIL_SCHEMA_VERSION),
  dataStatus: DataStatusSchema,
  result: BenefitDetailSchema,
  generatedAt: DateTimeSchema
});

export const UpcomingDeadlinesRequestSchema = z.strictObject({
  profile: StrictCoarseProfileSchema.prefault({}),
  withinDays: z.number().int().min(1).max(365).optional(),
  weights: RecommendationWeightsSchema.default({})
});

export const UpcomingDeadlineCandidateSchema = BenefitCandidateV2Schema.extend({
  applicationDeadline: DateTimeSchema
});

export const UpcomingDeadlinesResponseV2Schema = z.strictObject({
  schemaVersion: z.literal(UPCOMING_DEADLINES_SCHEMA_VERSION),
  profile: StrictCoarseProfileSchema,
  withinDays: z.number().int().min(1).max(365).optional(),
  rankingPolicy: RankingPolicySchema,
  dataStatus: DataStatusSchema,
  results: z.array(UpcomingDeadlineCandidateSchema).max(1_000),
  generatedAt: DateTimeSchema
});

export const PersonaPresetSchema = z.strictObject({
  id: RecommendationPersonaSchema,
  description: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.summary),
  weights: EffectiveRecommendationWeightsSchema
});

export const ListPersonasRequestSchema = z.strictObject({});
export const ListPersonasResponseSchema = z.strictObject({
  schemaVersion: z.literal(PERSONA_LIST_SCHEMA_VERSION),
  dataStatus: DataStatusSchema,
  personas: z.array(PersonaPresetSchema).max(32),
  generatedAt: DateTimeSchema
});

export const BuildChecklistRequestSchema = z.strictObject({ benefitId: OpaqueIdSchema });
export const ChecklistResponseSchema = z.strictObject({
  schemaVersion: z.literal(CHECKLIST_SCHEMA_VERSION),
  dataStatus: DataStatusSchema,
  benefitId: OpaqueIdSchema,
  items: z.array(ChecklistItemSchema).max(128),
  caveats: z.array(normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.long)).max(32),
  provenance: z.array(ProvenanceRecordSchema).min(1).max(256),
  links: z.array(VerifiedLinkSchema).min(1).max(16),
  generatedAt: DateTimeSchema
});

export const GetApplicationGuideRequestSchema = z.strictObject({ benefitId: OpaqueIdSchema });
export const ApplicationGuideResponseSchema = z.strictObject({
  schemaVersion: z.literal(APPLICATION_GUIDE_SCHEMA_VERSION),
  dataStatus: DataStatusSchema,
  benefitId: OpaqueIdSchema,
  steps: z.array(ApplicationStepSchema).max(100),
  safetyNotice: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.long),
  provenance: z.array(ProvenanceRecordSchema).min(1).max(256),
  links: z.array(VerifiedLinkSchema).min(1).max(16),
  generatedAt: DateTimeSchema
});

export const ChangeTypeSchema = z.enum(["created", "updated", "deleted"]);

export const ChangeLogEntrySchema = z.strictObject({
  id: OpaqueIdSchema,
  entityId: OpaqueIdSchema,
  entityType: z.literal("benefit"),
  changeType: ChangeTypeSchema,
  changedPaths: z.array(JsonPointerSchema).min(1).max(512),
  sourceId: OpaqueIdSchema,
  sourceRevision: VersionStringSchema,
  contentHash: Sha256Schema,
  summary: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.short),
  createdAt: DateTimeSchema
});

export const GetChangeLogRequestSchema = z.strictObject({
  entityId: OpaqueIdSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50)
});

export const GetChangeLogResponseSchema = z.strictObject({
  schemaVersion: z.literal(CHANGE_LOG_SCHEMA_VERSION),
  dataStatus: DataStatusSchema,
  entityId: OpaqueIdSchema.optional(),
  entries: z.array(ChangeLogEntrySchema).max(100),
  nextCursor: CursorSchema.optional(),
  generatedAt: DateTimeSchema
});

export const ToolNameSchema = z.enum([
  "searchBenefits",
  "getBenefitDetail",
  "getUpcomingDeadlines",
  "listPersonas",
  "buildChecklist",
  "getApplicationGuide",
  "getChangeLog"
]);

export const StableErrorCodeSchema = z.enum([
  "validation_error",
  "not_found",
  "all_sources_failed",
  "source_unavailable",
  "configuration_error",
  "unsupported_schema_version",
  "internal_error"
]);

export const StableMcpErrorSchema = z.strictObject({
  schemaVersion: z.literal(MCP_ERROR_SCHEMA_VERSION),
  tool: ToolNameSchema,
  error: z.strictObject({
    code: StableErrorCodeSchema,
    message: normalizedDisplayTextSchema(DISPLAY_TEXT_LIMITS.explanation),
    retryable: z.boolean()
  }),
  dataStatus: DataStatusSchema.optional(),
  generatedAt: DateTimeSchema
});

/** Test-only raw/normalized pair shipped for hostile consumer projection tests. */
export const HostileDisplayTextFixtureSchema = z.strictObject({
  raw: z.strictObject({
    title: z.string().min(1).max(10_000),
    summary: z.string().min(1).max(10_000),
    fakeGovernmentUrl: z.string().min(1).max(2_048)
  }),
  normalizedResponse: BenefitSearchResponseV2Schema
});

// Canonical endpoint names point at the v2 contracts. The AgeRange alias is
// retained because its values are identical to AgeBand; no v1 flat response
// shape is silently accepted by these aliases.
export const AgeRangeSchema = AgeBandSchema;
export const UserProfileSchema = StrictCoarseProfileSchema;
export const RecommendationStatusSchema = AssessmentStatusSchema;
export const BenefitSummarySchema = BenefitCandidateV2Schema;
export const BenefitSearchResponseSchema = BenefitSearchResponseV2Schema;
export const UpcomingDeadlineSummarySchema = UpcomingDeadlineCandidateSchema;
export const UpcomingDeadlinesResponseSchema = UpcomingDeadlinesResponseV2Schema;
export const ChangeLogResponseSchema = GetChangeLogResponseSchema;

export type BenefitCategory = z.infer<typeof BenefitCategorySchema>;
export type RegionCode = z.infer<typeof RegionCodeSchema>;
export type AgeBand = z.infer<typeof AgeBandSchema>;
export type AgeRange = AgeBand;
export type StudentStatus = z.infer<typeof StudentStatusSchema>;
export type EmploymentStatus = z.infer<typeof EmploymentStatusSchema>;
export type HouseholdType = z.infer<typeof HouseholdTypeSchema>;
export type RecommendationPersona = z.infer<typeof RecommendationPersonaSchema>;
export type RecommendationScoreDimension = z.infer<typeof RecommendationScoreDimensionSchema>;
export type EligibilityDimension = z.infer<typeof EligibilityDimensionSchema>;
export type RecommendationWeightValue = z.infer<typeof RecommendationWeightValueSchema>;
export type RecommendationWeights = z.infer<typeof RecommendationWeightsSchema>;
export type EffectiveRecommendationWeights = z.infer<typeof EffectiveRecommendationWeightsSchema>;
export type StrictCoarseProfile = z.infer<typeof StrictCoarseProfileSchema>;
export type UserProfile = StrictCoarseProfile;
export type ScoreBreakdownItem = z.infer<typeof ScoreBreakdownItemSchema>;
export type RankingPolicy = z.infer<typeof RankingPolicySchema>;
export type Ranking = z.infer<typeof RankingSchema>;
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;
export type RecommendationStatus = AssessmentStatus;
export type ConstraintOutcome = z.infer<typeof ConstraintOutcomeSchema>;
export type EvidenceBasis = z.infer<typeof EvidenceBasisSchema>;
export type AssessmentConstraint = z.infer<typeof AssessmentConstraintSchema>;
export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;
export type SourceObservationStatus = z.infer<typeof SourceObservationStatusSchema>;
export type SourceObservation = z.infer<typeof SourceObservationSchema>;
export type DataMode = z.infer<typeof DataStatusSchema>["mode"];
export type DataStatus = z.infer<typeof DataStatusSchema>;
export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;
export type LinkRelation = z.infer<typeof LinkRelationSchema>;
export type LinkHealth = z.infer<typeof LinkHealthSchema>;
export type VerifiedLink = z.infer<typeof VerifiedLinkSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type BenefitCandidateV2 = z.infer<typeof BenefitCandidateV2Schema>;
export type BenefitSummary = BenefitCandidateV2;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type ApplicationStep = z.infer<typeof ApplicationStepSchema>;
export type BenefitDetail = z.infer<typeof BenefitDetailSchema>;
export type BenefitRule = z.infer<typeof BenefitRuleSchema>;
export type BenefitRecord = z.infer<typeof BenefitRecordSchema>;
export type AdapterResult = z.infer<typeof AdapterResultSchema>;
export type BenefitRepositoryResult = z.infer<typeof BenefitRepositoryResultSchema>;
export type BenefitRepositoryDetailResult = z.infer<
  typeof BenefitRepositoryDetailResultSchema
>;
export type SourceSyncBatch = z.infer<typeof SourceSyncBatchSchema>;
export type BenefitSearchRequest = z.infer<typeof BenefitSearchRequestSchema>;
export type BenefitSearchResponseV2 = z.infer<typeof BenefitSearchResponseV2Schema>;
export type BenefitSearchResponse = BenefitSearchResponseV2;
export type GetBenefitDetailRequest = z.infer<typeof GetBenefitDetailRequestSchema>;
export type GetBenefitDetailResponse = z.infer<typeof GetBenefitDetailResponseSchema>;
export type UpcomingDeadlinesRequest = z.infer<typeof UpcomingDeadlinesRequestSchema>;
export type UpcomingDeadlineCandidate = z.infer<typeof UpcomingDeadlineCandidateSchema>;
export type UpcomingDeadlineSummary = UpcomingDeadlineCandidate;
export type UpcomingDeadlinesResponseV2 = z.infer<typeof UpcomingDeadlinesResponseV2Schema>;
export type UpcomingDeadlinesResponse = UpcomingDeadlinesResponseV2;
export type PersonaPreset = z.infer<typeof PersonaPresetSchema>;
export type ListPersonasRequest = z.infer<typeof ListPersonasRequestSchema>;
export type ListPersonasResponse = z.infer<typeof ListPersonasResponseSchema>;
export type BuildChecklistRequest = z.infer<typeof BuildChecklistRequestSchema>;
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;
export type GetApplicationGuideRequest = z.infer<typeof GetApplicationGuideRequestSchema>;
export type ApplicationGuideResponse = z.infer<typeof ApplicationGuideResponseSchema>;
export type ChangeType = z.infer<typeof ChangeTypeSchema>;
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;
export type GetChangeLogRequest = z.infer<typeof GetChangeLogRequestSchema>;
export type GetChangeLogResponse = z.infer<typeof GetChangeLogResponseSchema>;
export type ChangeLogResponse = GetChangeLogResponse;
export type ToolName = z.infer<typeof ToolNameSchema>;
export type StableErrorCode = z.infer<typeof StableErrorCodeSchema>;
export type StableMcpError = z.infer<typeof StableMcpErrorSchema>;
export type HostileDisplayTextFixture = z.infer<
  typeof HostileDisplayTextFixtureSchema
>;
