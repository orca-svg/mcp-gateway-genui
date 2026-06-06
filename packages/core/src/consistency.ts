import type { BenefitRecord } from "@mcp-gen-ui/schema";

/**
 * Plugin-style consistency checks. New rules can be added to the array (or
 * passed in) without touching the runner, so contributors extend validation
 * without rewriting core logic.
 */
export interface ConsistencyIssue {
  ruleId: string;
  severity: "error" | "warning";
  benefitId: string;
  message: string;
}

export interface ConsistencyRule {
  id: string;
  check(benefit: BenefitRecord): ConsistencyIssue[];
}

export const defaultConsistencyRules: ConsistencyRule[] = [
  {
    id: "required-source-url",
    check: (benefit) =>
      benefit.sourceUrl.length > 0
        ? []
        : [
            {
              ruleId: "required-source-url",
              severity: "error",
              benefitId: benefit.id,
              message: "sourceUrl is required."
            }
          ]
  },
  {
    id: "application-url-when-online",
    check: (benefit) =>
      benefit.applicationMethods.some((method) => method.includes("온라인")) &&
      !benefit.applicationUrl
        ? [
            {
              ruleId: "application-url-when-online",
              severity: "warning",
              benefitId: benefit.id,
              message: "Online application method should include an applicationUrl."
            }
          ]
        : []
  },
  {
    id: "dedupe-documents",
    check: (benefit) => {
      const labels = new Set<string>();
      return benefit.documents.flatMap((document) => {
        if (labels.has(document.label)) {
          return [
            {
              ruleId: "dedupe-documents",
              severity: "warning" as const,
              benefitId: benefit.id,
              message: `Duplicate document: ${document.label}`
            }
          ];
        }
        labels.add(document.label);
        return [];
      });
    }
  }
];

export function runConsistencyRules(
  benefits: BenefitRecord[],
  rules: ConsistencyRule[] = defaultConsistencyRules
): ConsistencyIssue[] {
  return benefits.flatMap((benefit) =>
    rules.flatMap((rule) => rule.check(benefit))
  );
}
