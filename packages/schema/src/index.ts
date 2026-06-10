import { z } from "zod";

/**
 * Single source of truth for the gateway's domain contracts.
 *
 * Every MCP tool input/output is defined here with Zod and exported to JSON
 * Schema (see export-json-schema.ts) so that non-TypeScript clients can
 * validate the same contracts.
 */

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

export const RecommendationStatusSchema = z.enum([
  "candidate",
  "needs_more_info",
  "not_applicable"
]);

export const AgeRangeSchema = z.enum([
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

export const RecommendationPersonaSchema = z.enum([
  "student",
  "job_seeker",
  "housing",
  "family",
  "default"
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

export const RecommendationWeightsSchema = z
  .object({
    region: z.number().nonnegative().optional(),
    age: z.number().nonnegative().optional(),
    student: z.number().nonnegative().optional(),
    employment: z.number().nonnegative().optional(),
    household: z.number().nonnegative().optional(),
    category: z.number().nonnegative().optional(),
    query: z.number().nonnegative().optional()
  })
  .strict();

export const ScoreBreakdownItemSchema = z.object({
  dimension: RecommendationScoreDimensionSchema,
  signal: z.number().min(0).max(1),
  weight: z.number().nonnegative(),
  contribution: z.number().min(0),
  explanation: z.string()
});

/**
 * Non-identifying user profile. By contract this never carries resident
 * registration numbers, certificates, tokens, or other sensitive identifiers.
 */
export const UserProfileSchema = z.object({
  region: z.string().min(1).optional(),
  ageRange: AgeRangeSchema.optional(),
  studentStatus: StudentStatusSchema.default("unknown"),
  employmentStatus: EmploymentStatusSchema.default("unknown"),
  householdType: HouseholdTypeSchema.default("unknown"),
  interests: z.array(BenefitCategorySchema).default([]),
  persona: RecommendationPersonaSchema.optional()
});

export const EvidenceSchema = z.object({
  field: z.string(),
  matched: z.boolean(),
  explanation: z.string()
});

export const BenefitSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  provider: z.string().min(1),
  category: BenefitCategorySchema,
  summary: z.string().min(1),
  status: RecommendationStatusSchema,
  score: z.number().min(0).max(1).default(0),
  scoreBreakdown: z.array(ScoreBreakdownItemSchema).default([]),
  reasons: z.array(z.string()).default([]),
  missingInfo: z.array(z.string()).default([])
});

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  source: z.string().optional()
});

export const ApplicationStepSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  requiresUserAction: z.boolean().default(true)
});

export const BenefitDetailSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  provider: z.string().min(1),
  category: BenefitCategorySchema,
  summary: z.string().min(1),
  target: z.string().min(1),
  eligibility: z.array(z.string()).default([]),
  applicationPeriod: z.string().optional(),
  fee: z.string().optional(),
  processingTime: z.string().optional(),
  documents: z.array(ChecklistItemSchema).default([]),
  applicationMethods: z.array(z.string()).default([]),
  applicationUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
  lastFetchedAt: z.string().datetime(),
  evidence: z.array(EvidenceSchema).default([])
});

/**
 * Repository-side record. Extends the public detail with matchable fields the
 * rule-based recommender uses. These extra fields stay inside the gateway and
 * are not part of the public BenefitDetail contract.
 */
export const BenefitRecordSchema = BenefitDetailSchema.extend({
  searchableText: z.string().default(""),
  regionTags: z.array(z.string()).default([]),
  ageRanges: z.array(AgeRangeSchema).default([]),
  studentOnly: z.boolean().default(false),
  employmentStatuses: z.array(EmploymentStatusSchema).default([]),
  householdTypes: z.array(HouseholdTypeSchema).default([])
});

export const BenefitSearchRequestSchema = z.object({
  query: z.string().min(1),
  profile: UserProfileSchema.default({}),
  weights: RecommendationWeightsSchema.default({})
});

export const BenefitSearchResponseSchema = z.object({
  query: z.string(),
  profile: UserProfileSchema,
  results: z.array(BenefitSummarySchema),
  generatedAt: z.string().datetime()
});

export const ChecklistResponseSchema = z.object({
  benefitId: z.string(),
  items: z.array(ChecklistItemSchema),
  caveats: z.array(z.string()).default([])
});

export const ApplicationGuideResponseSchema = z.object({
  benefitId: z.string(),
  steps: z.array(ApplicationStepSchema),
  safetyNotice: z.string()
});

export const ChangeLogEntrySchema = z.object({
  id: z.string(),
  entityId: z.string(),
  entityType: z.literal("benefit"),
  changeType: z.enum(["created", "updated", "unchanged"]),
  summary: z.string(),
  createdAt: z.string().datetime()
});

export const ChangeLogResponseSchema = z.object({
  entityId: z.string().optional(),
  entries: z.array(ChangeLogEntrySchema)
});

export type BenefitCategory = z.infer<typeof BenefitCategorySchema>;
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;
export type AgeRange = z.infer<typeof AgeRangeSchema>;
export type StudentStatus = z.infer<typeof StudentStatusSchema>;
export type EmploymentStatus = z.infer<typeof EmploymentStatusSchema>;
export type HouseholdType = z.infer<typeof HouseholdTypeSchema>;
export type RecommendationPersona = z.infer<typeof RecommendationPersonaSchema>;
export type RecommendationScoreDimension = z.infer<typeof RecommendationScoreDimensionSchema>;
export type RecommendationWeights = z.infer<typeof RecommendationWeightsSchema>;
export type ScoreBreakdownItem = z.infer<typeof ScoreBreakdownItemSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type BenefitSummary = z.infer<typeof BenefitSummarySchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type ApplicationStep = z.infer<typeof ApplicationStepSchema>;
export type BenefitDetail = z.infer<typeof BenefitDetailSchema>;
export type BenefitRecord = z.infer<typeof BenefitRecordSchema>;
export type BenefitSearchRequest = z.infer<typeof BenefitSearchRequestSchema>;
export type BenefitSearchResponse = z.infer<typeof BenefitSearchResponseSchema>;
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;
export type ApplicationGuideResponse = z.infer<typeof ApplicationGuideResponseSchema>;
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;
export type ChangeLogResponse = z.infer<typeof ChangeLogResponseSchema>;
