import { readFile } from "node:fs/promises";
import {
  BenefitRecordSchema,
  BenefitRepositoryDetailResultSchema,
  BenefitRepositoryResultSchema,
  DataStatusSchema,
  type BenefitRecord,
  type BenefitRepositoryDetailResult,
  type BenefitRepositoryResult,
  type DataStatus
} from "../packages/schema/src/index.js";
import type { BenefitRepository } from "../packages/core/src/repository.js";

export interface JsonFileBenefitRepositoryOptions {
  now?: () => Date;
  sourceId?: string;
  adapterVersion?: string;
}

/**
 * Source-aware, read-only repository backed by an arbitrary JSON file.
 *
 * Fetching records never writes snapshots or change history. Applications that
 * need history pass an adapter result to the explicit ingestion service on a
 * separate sync path.
 */
export class JsonFileBenefitRepository implements BenefitRepository {
  readonly mode = "fixture" as const;
  private cache?: BenefitRecord[];
  private readonly now: () => Date;
  private readonly sourceId: string;
  private readonly adapterVersion: string;

  constructor(
    private readonly filePath: string,
    options: JsonFileBenefitRepositoryOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.sourceId = options.sourceId ?? "json-file";
    this.adapterVersion = options.adapterVersion ?? "example-json-file-2";
  }

  async search(): Promise<BenefitRepositoryResult> {
    const records = await this.loadBenefits();
    return BenefitRepositoryResultSchema.parse({
      records,
      dataStatus: this.dataStatus(records.length)
    });
  }

  async getById(id: string): Promise<BenefitRepositoryDetailResult> {
    const records = await this.loadBenefits();
    const record = records.find((benefit) => benefit.id === id);
    return BenefitRepositoryDetailResultSchema.parse({
      record,
      dataStatus: this.dataStatus(record ? 1 : 0)
    });
  }

  private async loadBenefits(): Promise<BenefitRecord[]> {
    if (this.cache) return this.cache;

    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const records = Array.isArray(parsed) ? parsed : [parsed];
    this.cache = records.map((record) => BenefitRecordSchema.parse(record));
    return this.cache;
  }

  private dataStatus(recordCount: number): DataStatus {
    const retrievedAt = this.now();
    if (!(retrievedAt instanceof Date) || !Number.isFinite(retrievedAt.getTime())) {
      throw new TypeError("Repository clock must return a valid Date.");
    }
    return DataStatusSchema.parse({
      mode: this.mode,
      partial: false,
      sources: [
        {
          sourceId: this.sourceId,
          status: "ok",
          retrievedAt: retrievedAt.toISOString(),
          recordCount,
          adapterVersion: this.adapterVersion
        }
      ]
    });
  }
}

// Usage sketch:
// const repository = new JsonFileBenefitRepository("./my-benefits-v2.json");
// const service = new BenefitToolService(repository);
// await service.searchBenefits({
//   query: "청년 주거",
//   profile: { regionCode: "KR-11", ageBand: "twenties" }
// });
