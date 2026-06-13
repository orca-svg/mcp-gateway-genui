import {
  ApplicationGuideResponseSchema,
  BenefitSearchRequestSchema,
  BenefitSearchResponseSchema,
  ChangeLogResponseSchema,
  ChecklistResponseSchema,
  UpcomingDeadlinesRequestSchema,
  UpcomingDeadlinesResponseSchema,
  type ApplicationGuideResponse,
  type BenefitDetail,
  type BenefitRecord,
  type BenefitSearchResponse,
  type ChangeLogResponse,
  type ChecklistResponse,
  type UpcomingDeadlinesResponse
} from "@mcp-gen-ui/schema";
import type { BenefitRepository } from "./repository.js";
import { recommendBenefits } from "./recommender.js";
import type { SnapshotStore } from "./sqlite-store.js";

export const NON_ELIGIBILITY_DISCLAIMER =
  "Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.";

/**
 * Transport-neutral entry point for the gateway tools. The MCP server (or any
 * other transport) calls these methods; there is no LLM here — orchestration is
 * the host's responsibility. Every input and output is validated against the
 * shared Zod contracts.
 */
export class BenefitToolService {
  constructor(
    private readonly repository: BenefitRepository,
    private readonly snapshots?: SnapshotStore
  ) {}

  async searchBenefits(input: unknown): Promise<BenefitSearchResponse> {
    const request = BenefitSearchRequestSchema.parse(input);
    const benefits = await this.repository.search();
    const results = recommendBenefits(benefits, request);
    this.recordSnapshots(benefits);

    return BenefitSearchResponseSchema.parse({
      query: request.query,
      profile: request.profile,
      results,
      generatedAt: new Date().toISOString()
    });
  }

  async getBenefitDetail(id: string): Promise<BenefitDetail> {
    const benefit = await this.repository.getById(id);
    if (!benefit) {
      throw new Error(`Benefit not found: ${id}`);
    }
    this.snapshots?.recordBenefitSnapshot(benefit);
    return benefit;
  }

  async getUpcomingDeadlines(input: unknown): Promise<UpcomingDeadlinesResponse> {
    const request = UpcomingDeadlinesRequestSchema.parse(input ?? {});
    const benefits = await this.repository.search();
    const now = Date.now();
    const maxDeadline =
      request.withinDays === undefined
        ? undefined
        : now + request.withinDays * 24 * 60 * 60 * 1000;
    const recommended = recommendBenefits(benefits, {
      query: "혜택 지원 신청 마감",
      profile: request.profile,
      weights: {}
    });
    const recommendationById = new Map(recommended.map((summary) => [summary.id, summary]));

    const results = benefits
      .filter((benefit) => benefit.applicationDeadline)
      .map((benefit) => ({
        benefit,
        deadlineTime: Date.parse(benefit.applicationDeadline!),
        recommendation: recommendationById.get(benefit.id)
      }))
      .filter(
        ({ deadlineTime, recommendation }) =>
          Number.isFinite(deadlineTime) &&
          deadlineTime >= now &&
          (maxDeadline === undefined || deadlineTime <= maxDeadline) &&
          recommendation?.status !== "not_applicable"
      )
      .sort((a, b) => a.deadlineTime - b.deadlineTime)
      .map(({ benefit, recommendation }) => ({
        id: benefit.id,
        title: benefit.title,
        provider: benefit.provider,
        category: benefit.category,
        summary: benefit.summary,
        status: recommendation?.status ?? "needs_more_info",
        score: recommendation?.score ?? 0,
        scoreBreakdown: recommendation?.scoreBreakdown ?? [],
        reasons: recommendation?.reasons ?? [],
        missingInfo: recommendation?.missingInfo ?? [],
        applicationDeadline: benefit.applicationDeadline!
      }));

    this.recordSnapshots(benefits);

    return UpcomingDeadlinesResponseSchema.parse({
      profile: request.profile,
      withinDays: request.withinDays,
      results,
      generatedAt: new Date().toISOString()
    });
  }

  async buildChecklist(benefitId: string): Promise<ChecklistResponse> {
    const benefit = await this.getBenefitDetail(benefitId);
    return ChecklistResponseSchema.parse({
      benefitId,
      items: benefit.documents,
      caveats: [NON_ELIGIBILITY_DISCLAIMER]
    });
  }

  async getApplicationGuide(benefitId: string): Promise<ApplicationGuideResponse> {
    const benefit = await this.getBenefitDetail(benefitId);
    return ApplicationGuideResponseSchema.parse({
      benefitId,
      steps: [
        {
          order: 1,
          title: "대상 조건 확인",
          description: `${benefit.target} 조건과 본인의 비식별 조건이 맞는지 확인합니다.`,
          requiresUserAction: true
        },
        {
          order: 2,
          title: "준비물 확인",
          description: "필수 서류와 추가 확인 조건을 체크리스트로 점검합니다.",
          requiresUserAction: true
        },
        {
          order: 3,
          title: "공식 신청 경로 이동",
          description: benefit.applicationUrl
            ? `공식 신청 경로에서 직접 로그인하고 신청합니다: ${benefit.applicationUrl}`
            : "공식 안내 페이지에서 최신 신청 경로를 확인합니다.",
          requiresUserAction: true
        }
      ],
      safetyNotice:
        "MCP 서버는 로그인, 본인인증, 민감정보 입력, 제출을 대신 수행하지 않습니다."
    });
  }

  async getChangeLog(entityId?: string): Promise<ChangeLogResponse> {
    return ChangeLogResponseSchema.parse({
      entityId,
      entries: this.snapshots?.getChangeLog(entityId) ?? []
    });
  }

  private recordSnapshots(benefits: BenefitRecord[]): void {
    if (!this.snapshots) return;
    for (const benefit of benefits) {
      this.snapshots.recordBenefitSnapshot(benefit);
    }
  }
}
