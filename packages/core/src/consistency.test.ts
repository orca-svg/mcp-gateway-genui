import { describe, expect, it } from "vitest";
import { runConsistencyRules } from "./consistency.js";
import { fixtureBenefits } from "./fixtures.js";
import type { BenefitRecord } from "@mcp-gen-ui/schema";

const base = fixtureBenefits[0]!;

describe("runConsistencyRules", () => {
  it("reports no issues for valid fixtures", () => {
    expect(runConsistencyRules(fixtureBenefits)).toEqual([]);
  });

  it("flags a missing source URL as an error", () => {
    const invalid: BenefitRecord = { ...base, sourceUrl: "" };
    const issues = runConsistencyRules([invalid]);
    expect(issues.some((i) => i.ruleId === "required-source-url" && i.severity === "error")).toBe(
      true
    );
  });

  it("warns when an online method lacks an application URL", () => {
    const partial: BenefitRecord = {
      ...base,
      applicationMethods: ["온라인 신청"],
      applicationUrl: undefined
    };
    const issues = runConsistencyRules([partial]);
    expect(issues.some((i) => i.ruleId === "application-url-when-online")).toBe(true);
  });

  it("warns on duplicate documents", () => {
    const dupes: BenefitRecord = {
      ...base,
      documents: [
        { id: "a", label: "임대차계약서", required: true },
        { id: "b", label: "임대차계약서", required: true }
      ]
    };
    const issues = runConsistencyRules([dupes]);
    expect(issues.some((i) => i.ruleId === "dedupe-documents")).toBe(true);
  });
});
