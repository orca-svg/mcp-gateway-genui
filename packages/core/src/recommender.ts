import type {
  BenefitCandidateV2,
  BenefitRecord,
  BenefitSearchRequest,
  Freshness,
  RankingPolicy
} from "@mcp-gen-ui/schema";
import { assessBenefit } from "./assessment.js";
import {
  buildRankingPolicy,
  rankBenefit
} from "./ranking.js";
import {
  defaultPersonaRegistry,
  type PersonaRegistry
} from "./personas.js";

export { assessBenefit } from "./assessment.js";
export { buildRankingPolicy, rankBenefit } from "./ranking.js";
export { defaultPersonaRegistry, resolveWeights } from "./personas.js";

export type RecommendationResult = {
  results: BenefitCandidateV2[];
  rankingPolicy: RankingPolicy;
};

/**
 * Compose independent assessment and relative ranking into public v2 candidates.
 * No record is excluded for a conflict; score ties use opaque IDs only.
 */
export function recommendBenefits(
  records: BenefitRecord[],
  request: BenefitSearchRequest,
  options: { personas?: PersonaRegistry } = {}
): RecommendationResult {
  const rankingPolicy = buildRankingPolicy(
    request.profile.persona,
    request.weights,
    options.personas ?? defaultPersonaRegistry
  );

  const results = records
    .map((record) => toCandidate(record, request, rankingPolicy))
    .sort(
      (left, right) =>
        right.ranking.score - left.ranking.score || compareOpaqueIds(left.id, right.id)
    );

  return { results, rankingPolicy };
}

function toCandidate(
  record: BenefitRecord,
  request: BenefitSearchRequest,
  rankingPolicy: RankingPolicy
): BenefitCandidateV2 {
  return {
    id: record.id,
    title: record.title,
    provider: record.provider,
    category: record.category,
    summary: record.summary,
    assessment: assessBenefit(record, request.profile),
    ranking: rankBenefit(record, request.profile, request.query, rankingPolicy),
    provenance: record.provenance,
    links: record.links,
    freshness: freshnessFromRecord(record)
  };
}

function freshnessFromRecord(record: BenefitRecord): Freshness {
  const isStale = record.links.some(
    (link) => link.health === "stale" || link.health === "unreachable"
  );
  const isVerified = record.links.some((link) => link.health === "verified");
  return {
    status: isStale ? "stale" : isVerified ? "fresh" : "unknown",
    observedAt: record.lastFetchedAt
  };
}

function compareOpaqueIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
