import type {
  EffectiveRecommendationWeights,
  PersonaPreset as SchemaPersonaPreset,
  RecommendationPersona,
  RecommendationWeights
} from "@mcp-gen-ui/schema";

export type ResolvedRecommendationWeights = EffectiveRecommendationWeights;
export type PersonaPreset = SchemaPersonaPreset;
export type PersonaRegistry = Partial<Record<RecommendationPersona, PersonaPreset>>;

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
 * preserves the uniform-weight default, while the other presets make a single
 * coarse user context more prominent in relative ranking only.
 */
export const defaultPersonaRegistry = {
  youth_jobseeker: {
    id: "youth_jobseeker",
    description: "Youth job seekers prioritizing employment and age signals plus query intent.",
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
    description: "University students prioritizing student and age signals plus benefit category.",
    weights: {
      ...uniformRecommendationWeights,
      age: 2,
      student: 3,
      category: 2
    }
  },
  newlywed_family: {
    id: "newlywed_family",
    description: "Newlywed families prioritizing household, housing/category, and regional signals.",
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
    description: "Single-parent households prioritizing household, family/category, region, and employment signals.",
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
    description: "Seniors prioritizing age and regional signals plus benefit category.",
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
} satisfies Required<PersonaRegistry>;

export function resolveWeights(
  persona: RecommendationPersona | undefined,
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
