import { describe, expect, it } from "vitest";
import { runConsistencyRules } from "./consistency.js";
import { fixtureBenefits } from "./fixtures.js";
import type { BenefitRecord } from "@mcp-gen-ui/schema";

const base = fixtureBenefits[0]!;

describe("runConsistencyRules", () => {
  it("reports no issues for valid fixtures", () => {
    expect(runConsistencyRules(fixtureBenefits)).toEqual([]);
  });

  it("flags a missing source link as an error", () => {
    const invalid: BenefitRecord = {
      ...base,
      links: base.links.filter((link) => link.rel !== "source")
    };
    const issues = runConsistencyRules([invalid]);
    expect(issues.some((i) => i.ruleId === "required-source-link" && i.severity === "error")).toBe(
      true
    );
  });

  it("warns when an online method lacks a separate apply link", () => {
    const partial: BenefitRecord = {
      ...base,
      applicationMethods: ["Online application"],
      links: base.links.filter((link) => link.rel !== "apply")
    };
    const issues = runConsistencyRules([partial]);
    expect(issues.some((i) => i.ruleId === "application-link-when-online")).toBe(true);
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
