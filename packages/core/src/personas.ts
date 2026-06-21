import type {
  RecommendationPersona,
  RecommendationWeights
} from "@mcp-gen-ui/schema";

export type ResolvedRecommendationWeights = Required<RecommendationWeights>;

export type PersonaPreset<Id extends string = string> = {
  id: Id;
  description: string;
  weights: ResolvedRecommendationWeights;
};

export type PersonaRegistry<Id extends string = string> = Record<Id, PersonaPreset<Id>>;

export const uniformRecommendationWeights: ResolvedRecommendationWeights = {
  region: 1,
  age: 1,
  student: 1,
  employment: 1,
  household: 1,
  category: 1,
  query: 1
};

/**
 * Built-in starter personas for public-benefit ranking.
 *
 * These are intentionally small, documented presets rather than hidden policy:
 * embedders can replace the registry to reflect their own audience. `general`
 * preserves the previous uniform-weight default, while the other presets make a
 * single user context more prominent without disabling any score dimension.
 */
export const defaultPersonaRegistry = {
  youth_jobseeker: {
    id: "youth_jobseeker",
    description: "Youth job seekers prioritizing employment fit, age fit, and query intent.",
    weights: {
      ...uniformRecommendationWeights,
      age: 2,
      employment: 3,
      category: 1.5,
      query: 2
    }
  },
  university_student: {
    id: "university_student",
    description: "University students prioritizing student eligibility, age fit, and benefit category.",
    weights: {
      ...uniformRecommendationWeights,
      age: 2,
      student: 3,
      category: 2
    }
  },
  newlywed_family: {
    id: "newlywed_family",
    description: "Newlywed families prioritizing household, housing/category, and regional fit.",
    weights: {
      ...uniformRecommendationWeights,
      region: 2,
      age: 1.5,
      household: 3,
      category: 2
    }
  },
  single_parent: {
    id: "single_parent",
    description: "Single-parent households prioritizing household, family/category, region, and employment fit.",
    weights: {
      ...uniformRecommendationWeights,
      region: 2,
      employment: 1.5,
      household: 3,
      category: 2
    }
  },
  senior: {
    id: "senior",
    description: "Seniors prioritizing age fit, local/regional availability, and category fit.",
    weights: {
      ...uniformRecommendationWeights,
      region: 1.5,
      age: 3,
      category: 2
    }
  },
  general: {
    id: "general",
    description: "General-purpose default with uniform weights across all scoring dimensions.",
    weights: { ...uniformRecommendationWeights }
  }
} satisfies PersonaRegistry<RecommendationPersona>;

export function resolveWeights(
  persona: RecommendationPersona | string | undefined,
  overrides: RecommendationWeights = {},
  registry: PersonaRegistry = defaultPersonaRegistry
): ResolvedRecommendationWeights {
  const preset = persona ? registry[persona] : registry.general;
  return {
    ...(preset?.weights ?? registry.general?.weights ?? uniformRecommendationWeights),
    ...overrides
  };
}

export function listPersonaPresets(registry: PersonaRegistry = defaultPersonaRegistry): PersonaPreset[] {
  return Object.values(registry);
}
