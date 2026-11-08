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
  compiler: "claude-sonnet-5-5",
  /** Sear / doneness vision probe (RapidRouterVisionService). */
  vision: "claude-sonnet-5-5",
  /** Chef coach voice lines (ChefVoiceBanner / CHEF_COACH_SPEAK). */
  coach: "claude-sonnet-5-5",
  /** Page-fault ingredient synthesizer (AssetPageTable, Part 2). */
  synthesizer: "claude-sonnet-5-5",
  /** Chef Director (Cook/CookDirectorService): dish request -> CookPlan JSON (equipment, tools, ingredients, steps). */
  director: "claude-sonnet-5-5",
  /** Shape Smith (Cook ShapeRecipe calls): ingredient / vessel -> small procedural ShapeRecipe JSON. */
  smith: "claude-sonnet-5-5",
};

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
