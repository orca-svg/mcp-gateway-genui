import { BenefitRecordSchema, type BenefitRecord } from "@mcp-gen-ui/schema";
import { fixtureBenefits } from "./fixtures.js";

/**
 * Transport- and backend-neutral access to benefit records. The MVP ships a
 * fixture-backed implementation so the whole suite runs without live
 * government-site dependencies; future backends (API, cache) implement the
 * same interface.
 */
export interface BenefitRepository {
  search(): Promise<BenefitRecord[]>;
  getById(id: string): Promise<BenefitRecord | undefined>;
}

export class FixtureBenefitRepository implements BenefitRepository {
  private readonly benefits: BenefitRecord[];

  constructor(benefits: BenefitRecord[] = fixtureBenefits) {
    // Parse on construction so malformed fixtures fail fast at the boundary.
    this.benefits = benefits.map((benefit) => BenefitRecordSchema.parse(benefit));
  }

  async search(): Promise<BenefitRecord[]> {
    return this.benefits;
  }

  async getById(id: string): Promise<BenefitRecord | undefined> {
    return this.benefits.find((benefit) => benefit.id === id);
  }
}
