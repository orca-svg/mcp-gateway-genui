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
    id: "required-source-link",
    check: (benefit) =>
      benefit.links.some((link) => link.rel === "source")
        ? []
        : [
            {
              ruleId: "required-source-link",
              severity: "error",
              benefitId: benefit.id,
              message: "A source link is required."
            }
          ]
  },
  {
    id: "application-link-when-online",
    check: (benefit) =>
      benefit.applicationMethods.some((method) =>
        /online|온라인/iu.test(method)
      ) && !benefit.links.some((link) => link.rel === "apply")
        ? [
            {
              ruleId: "application-link-when-online",
              severity: "warning",
              benefitId: benefit.id,
              message: "An online application method should include a separate apply link."
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
