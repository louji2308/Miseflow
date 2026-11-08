/**
 * CookPlanSchema.ts  (Chef Director v6, the contract every Cook/ module shares)
 *
 * A CookPlan is a free-form description of ONE dish: which equipment, tools and ingredients it needs, and an ordered
 * (partly parallel) list of steps. It is produced by the AI "Director" call (or taken from PlanLibrary) and validated
 * by CookPlanSanitizer. Nothing here assumes the salmon template: no fixed stations, no 5 prep lanes, no single protein.
 *
 * The JSON schema is deliberately FLAT and small: Anthropic rejects big grammars ("compiled grammar is too large"),
 * which the old 5-tuple/4-card blueprint schema hit. Ranges, counts and cross references are enforced afterwards by the
 * sanitizer, never by schema keywords (no min/max/minItems/maxLength).
 */

export type Rgb = number[]; // [r,g,b] linear 0..1 (sanitizer enforces 3 components)

export const EQUIPMENT_KINDS: string[] = [
  "WOK", "KADAI", "TAWA", "SKILLET", "POT", "SAUCEPAN", "BOWL", "PLATE", "BOARD", "FRYER_PAN", "STEAMER", "HANDI",
];
export const TOOL_KINDS: string[] = [
  "SPATULA", "LADLE", "TONGS", "WHISK", "SPOON", "ROLLING_PIN", "KNIFE", "SKIMMER", "CHOPSTICKS", "BRUSH",
];
export const INGREDIENT_ROLES: string[] = [
  "PROTEIN", "VEG", "FLOUR", "LIQUID", "OIL", "SPICE", "DOUGH", "GARNISH", "AROMATIC", "DAIRY",
];
export const HEAT_LEVELS: string[] = ["OFF", "LOW", "MED", "HIGH"];

/** Closed action vocabulary. Unknown or unimplemented actions degrade to GENERIC at runtime, never a crash. */
export const COOK_ACTIONS: string[] = [
  "CUT", "MARINATE", "MIX", "COAT", "HEAT_OIL", "DEEP_FRY", "SHALLOW_FRY", "SAUTE_TOSS", "TEMPER", "SIMMER", "BOIL",
  "ROLL_DOUGH", "KNEAD", "COOK_FLAT", "FLIP", "STEAM_DUM", "WHISK", "POUR", "SEASON", "REST", "PLATE", "GARNISH",
];
export type CookAction =
  | "CUT" | "MARINATE" | "MIX" | "COAT" | "HEAT_OIL" | "DEEP_FRY" | "SHALLOW_FRY" | "SAUTE_TOSS" | "TEMPER"
  | "SIMMER" | "BOIL" | "ROLL_DOUGH" | "KNEAD" | "COOK_FLAT" | "FLIP" | "STEAM_DUM" | "WHISK" | "POUR" | "SEASON"
  | "REST" | "PLATE" | "GARNISH" | "GENERIC";

export const NOT_FOUND_TEXT = "Dish not found. Enter the correct dish name.";

export interface CookEquipment {
  id: string;
  kind: string;        // one of EQUIPMENT_KINDS (unknown -> BOWL/POT by sanitizer)
  role: string;        // short human text: "frying kadai", "marinade bowl"
  burner: number;      // 0 = not on a burner, 1..3 = burner slot
}

export interface CookTool {
  id: string;
  kind: string;        // one of TOOL_KINDS
}

export interface CookIngredient {
  id: string;
  name: string;        // "boneless chicken"
  role: string;        // one of INGREDIENT_ROLES
  form: string;        // free text shape cue: "irregular boneless chunks", "round dough ball"
  catalogueHint: number; // AssetPageTable access number if the AI is sure (101-166, 140-149...), else 0
  colorRaw: Rgb;
  colorDone: Rgb;
  amount: string;      // "500 g" (display only)
}

export interface CookStep {
  id: string;          // snake_case, unique
  action: string;      // one of COOK_ACTIONS
  title: string;       // <= 28 chars
  whatWhy: string;     // <= 110 chars: what to do + why it works
  equipmentId: string; // where it happens
  toolId: string;      // "" = none
  ingredientIds: string[];
  fromId: string;      // optional equipment id items come from ("" = none)
  toId: string;        // optional equipment id items go to ("" = none)
  durationSec: number; // animation length at 1x
  heat: string;        // one of HEAT_LEVELS
  count: number;       // repetitions (tosses, stirs, batches...), 0 = default
  after: string[];     // step ids that must finish first; empty = starts when the previous step in the list is done
}

export interface CookPlan {
  found: boolean;
  notFoundMessage: string;
  dishTitle: string;   // <= 32
  cuisineTag: string;  // <= 24
  equipment: CookEquipment[];
  tools: CookTool[];
  ingredients: CookIngredient[];
  steps: CookStep[];
  plateEquipmentId: string;
  garnishIds: string[];
}

// ── Flat JSON schema for Anthropic structured output ─────────────────────────────────────────────────────────────
const S = { type: "string" };
const N = { type: "number" };
const B = { type: "boolean" };
const RGB = { type: "array", items: N };
const STRS = { type: "array", items: S };

function obj(props: { [k: string]: any }): any {
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

export const CookPlanJsonSchema: any = obj({
  found: B,
  notFoundMessage: S,
  dishTitle: S,
  cuisineTag: S,
  equipment: {
    type: "array",
    items: obj({ id: S, kind: { type: "string", enum: EQUIPMENT_KINDS }, role: S, burner: N }),
  },
  tools: {
    type: "array",
    items: obj({ id: S, kind: { type: "string", enum: TOOL_KINDS } }),
  },
  ingredients: {
    type: "array",
    items: obj({
      id: S, name: S, role: { type: "string", enum: INGREDIENT_ROLES }, form: S, catalogueHint: N,
      colorRaw: RGB, colorDone: RGB, amount: S,
    }),
  },
  steps: {
    type: "array",
    items: obj({
      id: S, action: { type: "string", enum: COOK_ACTIONS }, title: S, whatWhy: S, equipmentId: S, toolId: S,
      ingredientIds: STRS, fromId: S, toId: S, durationSec: N, heat: { type: "string", enum: HEAT_LEVELS },
      count: N, after: STRS,
    }),
  },
  plateEquipmentId: S,
  garnishIds: STRS,
});
