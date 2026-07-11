import {
  APPLICATION_GUIDE_SCHEMA_VERSION,
  ApplicationGuideResponseSchema,
  BENEFIT_DETAIL_SCHEMA_VERSION,
  BENEFIT_SEARCH_SCHEMA_VERSION,
  BenefitSearchRequestSchema,
  BenefitSearchResponseV2Schema,
  BuildChecklistRequestSchema,
  CHANGE_LOG_SCHEMA_VERSION,
  CHECKLIST_SCHEMA_VERSION,
  ChecklistResponseSchema,
  GetApplicationGuideRequestSchema,
  GetBenefitDetailRequestSchema,
  GetBenefitDetailResponseSchema,
  GetChangeLogRequestSchema,
  GetChangeLogResponseSchema,
  ListPersonasResponseSchema,
  PERSONA_LIST_SCHEMA_VERSION,
  UPCOMING_DEADLINES_SCHEMA_VERSION,
  UpcomingDeadlinesRequestSchema,
  UpcomingDeadlinesResponseV2Schema,
  type ApplicationGuideResponse,
  type BenefitCandidateV2,
  type BenefitDetail,
  type BenefitRecord,
  type BenefitSearchResponse,
  type ChecklistResponse,
  type DataStatus,
  type GetBenefitDetailResponse,
  type GetChangeLogResponse,
  type ListPersonasResponse,
  type UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";
import { GatewayError } from "./errors.js";
import type { BenefitRepository } from "./repository.js";
import { hasSuccessfulSource } from "./repository.js";
import { recommendBenefits } from "./recommender.js";
import { SnapshotStoreError, type ChangeLogPage } from "./sqlite-store.js";
import {
  defaultPersonaRegistry,
  listPersonaPresets,
  type PersonaRegistry
} from "./personas.js";

export type BenefitToolServiceOptions = {
  personas?: PersonaRegistry;
  now?: () => Date;
  gatewayVersion?: string;
};

export interface ChangeLogReader {
  getChangeLogPage(input?: unknown): ChangeLogPage;
}

export const NON_ELIGIBILITY_DISCLAIMER =
  "Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.";

/** Transport-neutral, validation-first implementation of the seven read tools. */
export class BenefitToolService {
  private readonly personas: PersonaRegistry;
  private readonly now: () => Date;
  private readonly gatewayVersion: string;

  constructor(
    private readonly repository: BenefitRepository,
    private readonly changeLog?: ChangeLogReader,
    options: BenefitToolServiceOptions = {}
  ) {
    this.personas = options.personas ?? defaultPersonaRegistry;
    this.now = options.now ?? (() => new Date());
    this.gatewayVersion = options.gatewayVersion ?? "2.0.0";
  }

  async listPersonas(): Promise<ListPersonasResponse> {
    const generatedAt = this.generatedAt();
    const personas = listPersonaPresets(this.personas);
    return ListPersonasResponseSchema.parse({
      schemaVersion: PERSONA_LIST_SCHEMA_VERSION,
      dataStatus: this.metadataStatus(generatedAt, personas.length),
      personas,
      generatedAt
    });
  }

  async searchBenefits(input: unknown): Promise<BenefitSearchResponse> {
    const request = BenefitSearchRequestSchema.parse(input);
    const repositoryResult = await this.repository.search();
    ensureAvailable(repositoryResult.dataStatus);
    const recommendation = recommendBenefits(repositoryResult.records, request, {
      personas: this.personas
    });

    return BenefitSearchResponseV2Schema.parse({
      schemaVersion: BENEFIT_SEARCH_SCHEMA_VERSION,
      query: request.query,
      profile: request.profile,
      rankingPolicy: recommendation.rankingPolicy,
      dataStatus: repositoryResult.dataStatus,
      results: recommendation.results,
      generatedAt: this.generatedAt()
    });
  }

  async getBenefitDetail(input: unknown): Promise<GetBenefitDetailResponse> {
    const request = GetBenefitDetailRequestSchema.parse(input);
    const lookup = await this.repository.getById(request.id);
    ensureAvailable(lookup.dataStatus);
    if (!lookup.record) throw new GatewayError("not_found");

    const result = this.detailCandidate(lookup.record);
    return GetBenefitDetailResponseSchema.parse({
      schemaVersion: BENEFIT_DETAIL_SCHEMA_VERSION,
      dataStatus: lookup.dataStatus,
      result,
      generatedAt: this.generatedAt()
    });
  }

  async getUpcomingDeadlines(input: unknown): Promise<UpcomingDeadlinesResponse> {
    const request = UpcomingDeadlinesRequestSchema.parse(input ?? {});
    const repositoryResult = await this.repository.search();
    ensureAvailable(repositoryResult.dataStatus);
    const now = this.nowMillis();
    const maxDeadline =
      request.withinDays === undefined
        ? undefined
        : now + request.withinDays * 24 * 60 * 60 * 1000;
    const recommendation = recommendBenefits(
      repositoryResult.records,
      {
        query: "benefit application deadline",
        profile: request.profile,
        weights: request.weights
      },
      { personas: this.personas }
    );
    const recordById = new Map(repositoryResult.records.map((record) => [record.id, record]));

    const results = recommendation.results
      .map((candidate) => ({ candidate, record: recordById.get(candidate.id) }))
      .filter(
        (value): value is { candidate: BenefitCandidateV2; record: BenefitRecord } =>
          Boolean(value.record?.applicationDeadline)
      )
      .map(({ candidate, record }) => ({
        candidate,
        deadline: record.applicationDeadline!,
        deadlineTime: Date.parse(record.applicationDeadline!)
      }))
      .filter(
        ({ deadlineTime }) =>
          Number.isFinite(deadlineTime) &&
          deadlineTime >= now &&
          (maxDeadline === undefined || deadlineTime <= maxDeadline)
      )
      .sort(
        (left, right) =>
          left.deadlineTime - right.deadlineTime ||
          right.candidate.ranking.score - left.candidate.ranking.score ||
          left.candidate.id.localeCompare(right.candidate.id)
      )
      .map(({ candidate, deadline }) => ({
        ...candidate,
        applicationDeadline: deadline
      }));

    return UpcomingDeadlinesResponseV2Schema.parse({
      schemaVersion: UPCOMING_DEADLINES_SCHEMA_VERSION,
      profile: request.profile,
      withinDays: request.withinDays,
      rankingPolicy: recommendation.rankingPolicy,
      dataStatus: repositoryResult.dataStatus,
      results,
      generatedAt: this.generatedAt()
    });
  }

  async buildChecklist(input: unknown): Promise<ChecklistResponse> {
    const request = BuildChecklistRequestSchema.parse(input);
    const lookup = await this.repository.getById(request.benefitId);
    ensureAvailable(lookup.dataStatus);
    if (!lookup.record) throw new GatewayError("not_found");

    return ChecklistResponseSchema.parse({
      schemaVersion: CHECKLIST_SCHEMA_VERSION,
      dataStatus: lookup.dataStatus,
      benefitId: lookup.record.id,
      items: lookup.record.documents,
      caveats: [NON_ELIGIBILITY_DISCLAIMER],
      provenance: lookup.record.provenance,
      links: lookup.record.links,
      generatedAt: this.generatedAt()
    });
  }

  async getApplicationGuide(input: unknown): Promise<ApplicationGuideResponse> {
    const request = GetApplicationGuideRequestSchema.parse(input);
    const lookup = await this.repository.getById(request.benefitId);
    ensureAvailable(lookup.dataStatus);
    if (!lookup.record) throw new GatewayError("not_found");

    return ApplicationGuideResponseSchema.parse({
      schemaVersion: APPLICATION_GUIDE_SCHEMA_VERSION,
      dataStatus: lookup.dataStatus,
      benefitId: lookup.record.id,
      steps: [
        {
          id: "verify-criteria",
          order: 1,
          title: "Verify current criteria",
          description: "Compare the candidate constraints with the latest official source before relying on the result.",
          requiresUserAction: true
        },
        {
          id: "prepare-documents",
          order: 2,
          title: "Prepare required documents",
          description: "Review the checklist and confirm any source-specific evidence directly with the provider.",
          requiresUserAction: true
        },
        {
          id: "open-official-link",
          order: 3,
          title: "Open the verified source",
          description: "Use the structured source or application link supplied separately; the gateway never logs in or submits for you.",
          requiresUserAction: true
        }
      ],
      safetyNotice:
        "The gateway does not log in, verify identity, collect credentials, enter sensitive information, or submit an application.",
      provenance: lookup.record.provenance,
      links: lookup.record.links,
      generatedAt: this.generatedAt()
    });
  }

  async getChangeLog(input: unknown = {}): Promise<GetChangeLogResponse> {
    const request = GetChangeLogRequestSchema.parse(input);
    let page: ChangeLogPage;
    try {
      page = this.changeLog?.getChangeLogPage(request) ?? { entries: [] };
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      if (error instanceof SnapshotStoreError && error.code === "invalid_request") {
        throw new GatewayError("validation_error");
      }
      throw new GatewayError("internal_error");
    }
    const generatedAt = this.generatedAt();
    return GetChangeLogResponseSchema.parse({
      schemaVersion: CHANGE_LOG_SCHEMA_VERSION,
      dataStatus: this.metadataStatus(generatedAt, page.entries.length),
      entityId: request.entityId,
      entries: page.entries,
      nextCursor: page.nextCursor,
      generatedAt
    });
  }

  private detailCandidate(record: BenefitRecord): BenefitDetail {
    const detailRequest = BenefitSearchRequestSchema.parse({
      query: "benefit detail"
    });
    const recommendation = recommendBenefits(
      [record],
      detailRequest,
      { personas: this.personas }
    );
    const candidate = recommendation.results[0];
    if (!candidate) throw new GatewayError("internal_error");
    return {
      ...candidate,
      target: record.target,
      eligibility: record.eligibility,
      applicationPeriod: record.applicationPeriod,
      applicationDeadline: record.applicationDeadline,
      fee: record.fee,
      processingTime: record.processingTime,
      documents: record.documents,
      applicationMethods: record.applicationMethods
    };
  }

  private metadataStatus(retrievedAt: string, recordCount: number): DataStatus {
    return {
      mode: this.repository.mode,
      partial: false,
      sources: [
        {
          sourceId: "gateway-core",
          status: "ok",
          retrievedAt,
          recordCount,
          adapterVersion: this.gatewayVersion
        }
      ]
    };
  }

  private generatedAt(): string {
    return this.validNow().toISOString();
  }

  private nowMillis(): number {
    return this.validNow().getTime();
  }

  private validNow(): Date {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new GatewayError("internal_error");
    }
    return value;
  }
}

function ensureAvailable(dataStatus: DataStatus): void {
  if (!hasSuccessfulSource(dataStatus)) {
    throw new GatewayError("all_sources_failed", {
      retryable: true,
      dataStatus
    });
  }
}
