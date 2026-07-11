import {
  BenefitRecordSchema,
  BenefitRepositoryDetailResultSchema,
  BenefitRepositoryResultSchema,
  DataStatusSchema,
  type BenefitRecord,
  type BenefitRepositoryDetailResult,
  type BenefitRepositoryResult,
  type DataStatus,
  type SourceObservation
} from "@mcp-gen-ui/schema";
import { fixtureBenefits } from "./fixtures.js";

/**
 * Source-aware, read-only repository contract.
 *
 * Fetching data is a read. Persisting snapshots and change events belongs to
 * the explicit ingestion service, never to a tool read path.
 */
export interface BenefitRepository {
  readonly mode: DataStatus["mode"];
  search(): Promise<BenefitRepositoryResult>;
  getById(id: string): Promise<BenefitRepositoryDetailResult>;
}

export type FixtureBenefitRepositoryOptions = {
  now?: () => Date;
  sourceId?: string;
  adapterVersion?: string;
};

const DEFAULT_FIXTURE_SOURCE_ID = "fixture-benefits";
const DEFAULT_FIXTURE_ADAPTER_VERSION = "2.0.0-fixture";

export class FixtureBenefitRepository implements BenefitRepository {
  readonly mode = "fixture" as const;
  private readonly benefits: BenefitRecord[];
  private readonly now: () => Date;
  private readonly sourceId: string;
  private readonly adapterVersion: string;

  constructor(
    benefits: BenefitRecord[] = fixtureBenefits,
    options: FixtureBenefitRepositoryOptions = {}
  ) {
    this.benefits = benefits.map((benefit) => BenefitRecordSchema.parse(benefit));
    this.now = options.now ?? (() => new Date());
    this.sourceId = options.sourceId ?? DEFAULT_FIXTURE_SOURCE_ID;
    this.adapterVersion = options.adapterVersion ?? DEFAULT_FIXTURE_ADAPTER_VERSION;
  }

  async search(): Promise<BenefitRepositoryResult> {
    const dataStatus = this.dataStatus(this.benefits.length);
    return BenefitRepositoryResultSchema.parse({
      records: this.benefits,
      dataStatus
    });
  }

  async getById(id: string): Promise<BenefitRepositoryDetailResult> {
    const record = this.benefits.find((benefit) => benefit.id === id);
    return BenefitRepositoryDetailResultSchema.parse({
      record,
      dataStatus: this.dataStatus(record ? 1 : 0)
    });
  }

  private dataStatus(recordCount: number): DataStatus {
    const retrievedAt = safeNow(this.now);
    return DataStatusSchema.parse({
      mode: "fixture",
      partial: false,
      sources: [
        {
          sourceId: this.sourceId,
          status: "ok",
          retrievedAt,
          recordCount,
          adapterVersion: this.adapterVersion
        }
      ]
    });
  }
}

export function hasSuccessfulSource(dataStatus: DataStatus): boolean {
  return dataStatus.sources.some(
    (source) => source.status === "ok" || source.status === "partial"
  );
}

export function dataStatusFromObservations(
  mode: DataStatus["mode"],
  sources: SourceObservation[]
): DataStatus {
  const successfulSources = sources.filter(
    (source) => source.status === "ok" || source.status === "partial"
  );
  return DataStatusSchema.parse({
    mode,
    partial:
      successfulSources.length !== sources.length ||
      sources.some((source) => source.status === "partial"),
    sources
  });
}

function safeNow(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Repository clock must return a valid Date.");
  }
  return value.toISOString();
}
