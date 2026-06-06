import { readFile } from "node:fs/promises";
import {
  BenefitRecordSchema,
  type BenefitRecord
} from "../packages/schema/src/index.js";
import type { BenefitRepository } from "../packages/core/src/repository.js";

/**
 * Example asynchronous repository backed by an arbitrary JSON file.
 *
 * The gateway only requires `search()` and `getById()`, so API clients,
 * databases, object stores, caches, or local files can all implement the same
 * BenefitRepository contract without changing BenefitToolService or MCP wiring.
 */
export class JsonFileBenefitRepository implements BenefitRepository {
  private cache?: BenefitRecord[];

  constructor(private readonly filePath: string) {}

  async search(): Promise<BenefitRecord[]> {
    return this.loadBenefits();
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    const benefits = await this.loadBenefits();
    return benefits.find((benefit) => benefit.id === id);
  }

  private async loadBenefits(): Promise<BenefitRecord[]> {
    if (this.cache) return this.cache;

    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const records = Array.isArray(parsed) ? parsed : [parsed];

    this.cache = records.map((record) => BenefitRecordSchema.parse(record));
    return this.cache;
  }
}

// Usage sketch:
// const repository = new JsonFileBenefitRepository("./my-benefits.json");
// const service = new BenefitToolService(repository, optionalSnapshotStore);
// await service.searchBenefits({ query: "청년 주거", profile: { region: "서울" } });
