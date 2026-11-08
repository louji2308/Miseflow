/**
 * AiModelConfig.ts
 * Single place where Anthropic model ids are configured. NO other file may contain a model id.
 *
 * Every job is an EMPTY STRING placeholder until the project owner decides which Claude model runs it.
 * Empty model (or empty ANTHROPIC_API_KEY) = that live job is DISABLED and the offline presets /
 * scripted stand-in are used. Fill the strings below, nothing else needs to change.
 */

import { ANTHROPIC_API_KEY } from "./LocalSecrets";

export type AiJob = "compiler" | "vision" | "coach" | "synthesizer" | "director" | "smith";

export const AiModelConfig: { [job: string]: string } = {
  /** Dish recipe compiler (RecipeCompilerService): free text -> UniversalDishBlueprint JSON. */
  compiler: "claude-opus-5-5",
  /** Sear / doneness vision probe (RapidRouterVisionService). */
  vision: "claude-opus-5-5",
  /** Chef coach voice lines (ChefVoiceBanner / CHEF_COACH_SPEAK). */
  coach: "claude-opus-5-5",
  /** Page-fault ingredient synthesizer (AssetPageTable, Part 2). */
  synthesizer: "claude-opus-5-5",
  /** Chef Director (Cook/CookDirectorService): dish request -> CookPlan JSON (equipment, tools, ingredients, steps). */
  director: "claude-opus-5-5",
  /** Shape Smith (Cook ShapeRecipe calls): ingredient / vessel -> small procedural ShapeRecipe JSON. */
  smith: "claude-opus-5-5",
};

/**
 * Reasoning effort per job (output_config.effort). "high" for quality; "xhigh" is accepted by the API for Opus 5.5 but roughly
 * doubles latency again (a full CookPlan measured ~33 s at high vs ~59 s at xhigh from a command line, about 2x that inside Lens).
 */
export const AiEffortConfig: { [job: string]: string } = {
  compiler: "high",
  vision: "high",
  coach: "high",
  synthesizer: "medium", // tiny structured calls; keeps ingredient synthesis inside its timeout
  director: "high",
  smith: "high",
};

/** Configured effort for a job (defaults to "medium"). */
export function getEffort(job: AiJob): string {
  const e = AiEffortConfig[job];
  return typeof e === "string" && e.length > 0 ? e : "medium";
}

/** Configured model id for a job ("" = not configured). */
export function getModel(job: AiJob): string {
  const m = AiModelConfig[job];
  return typeof m === "string" ? m.trim() : "";
}

/** The Anthropic key from LocalSecrets.ts ("" on a clean clone). */
export function getApiKey(): string {
  return typeof ANTHROPIC_API_KEY === "string" ? ANTHROPIC_API_KEY.trim() : "";
}

/** True only when the job has a model id AND an API key. Otherwise callers must stay offline. */
export function isLiveEnabled(job: AiJob): boolean {
  return getModel(job).length > 0 && getApiKey().length > 0;
}
