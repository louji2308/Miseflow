/**
 * UniversalDishSchema.ts
 * Types + Anthropic structured-output JSON schema for a complete dish blueprint (implementation_plan WS12, D1 master catalogue).
 * A blueprint is pure data: DishLibraryConfig ships 6 verified presets, RecipeCompilerService can ask the
 * model for a new one, and ProposalGate.validateDishBlueprint() is the deterministic gate for every blueprint.
 *
 * Access-number map (see AssetPageTable.ts for the full tables + alias table):
 *   #101-#109, #122-#130  vegetables / greens / aromatics      (VegArchetype)
 *   #116-#121             starches                              (StarchArchetype + potato/bread)
 *   #140-#149             proteins (dual surface)               (ProteinArchetype)
 *   #160-#166             spices / dairy / oils / legumes       (PantryArchetype)
 *   #200-#299             page-fault (dynamic) cache
 *   #301-#355             vessels / tools / service ware
 */

/** Vegetable / aromatic archetypes (3 stages each: Whole, Partial, Cut pile). */
export type VegArchetype =
  | "BULB_ALLIUM"       // #101 Onion/Shallot, #102 Lobed Garlic, #125 Eggplant, #130 Beet/Radish
  | "CYLINDER_STALK"    // #105 Chilli, #106 Cucumber/Zucchini, #107 Carrot/Asparagus, #126 Scallion, #127 Corn
  | "SPHERE_CROWN"      // #104 Tomato, #108 Mushroom, #122 Bell Pepper, #123 Broccoli, #128 Citrus, #129 Avocado/Mango, #119 Potato
  | "LEAFY_HERB"        // #103 Fresh Herbs, #124 Bok Choy/Cabbage/Spinach
  | "CUBED_BLOCK"       // #109 Ginger Root, #121 Bread / Brioche
  | "GRANULAR";         // #127 Peas / sweet-corn kernels

/** Starch archetypes (#116 rice, #117/#118 noodles + pasta, #120 dough). */
export type StarchArchetype =
  | "GRANULAR_MOUND"    // #116 Basmati / Jasmine rice
  | "STRAND_TANGLE"     // #117 Ramen / Hakka / Udon, #118 Spaghetti
  | "TUBE_ARRAY"        // #118 Penne / rigatoni
  | "DISC_SHEET";       // #120 Dough / flatbread

/** Pantry archetypes (#160-#166). */
export type PantryArchetype =
  | "SPICE_CLUSTER"     // #160 Whole garam masala trio
  | "LIQUID_SWIRL";     // #164 Cream / coconut milk / yogurt swirl, #165 Oils & umami glazes

/** Everything a page-table prep/ingredient entry can be. */
export type PrepArchetype = VegArchetype | StarchArchetype | PantryArchetype;

export type ProteinArchetype =
  | "FILLET_SLAB"       // #140 Salmon, #142 Chicken Tikka slab, #146 Paneer, #147 Tofu
  | "MARBLED_STEAK"     // #141 Prime Ribeye Steak
  | "MEDALLION_SCALLOP" // #143 Tiger Prawns (C-curve), #144 Diver Scallops
  | "CUBED_SEAR"        // #142 Chicken Tikka cubes, #146 Paneer cubes, #148 Kofta, #149 Bacon / Pancetta
  | "DISC_SHEET";       // #145 Eggs (fried disc)

/** Protein hero kinematic (the sear station); the full set of 9 is KinematicId. */
export type PrimaryKinematicType = "KINE_SPATULA_FLIP_180" | "KINE_PAN_TOSS_ROLL";

/** The 9 kinematic primitives. */
export type KinematicId =
  | "KINE_ROCK_CHOP"
  | "KINE_TWO_STAGE_POUR"
  | "KINE_SPATULA_FLIP_180"
  | "KINE_PAN_TOSS_ROLL"
  | "KINE_LADLE_ORBITAL_STIR"
  | "KINE_NOODLE_LIFT_TOSS"
  | "KINE_RICE_DUM_LAYER"
  | "KINE_WHISK_EMULSION"
  | "KINE_CONVERGENCE_PLATING";

export type StationFocus = "PREP" | "SKILLET" | "SAUCEPOT" | "PLATING";

export type Rgb = [number, number, number];

export const NOT_FOUND_MESSAGE = "Dish not found. Enter the correct dish name.";

export interface CookbookCardSpec {
  stepNumber: number;            // 1..4
  stationFocus: StationFocus;
  headline: string;              // <= 28 chars, e.g., "1/4 PREP: 0.8CM BRUNOISE"
  instruction: string;           // <= 75 chars, shown on the briefing card
  masteryWhy: string;            // <= 65 chars, spoken via TTS / shown on ChefVoiceBannerUI
}

/** One step of the dish's own cooking flow (drives the K1 step engine, Auto Cook and the compact step card). */
export interface StepSpec {
  id: string;                    // unique snake_case id within the dish, e.g. "chop_veg"
  station: StationFocus;
  kinematic: KinematicId;
  durationSec: number;           // 1..600
  title: string;                 // <= 28 chars
  whatWhy: string;               // <= 90 chars: what to do + why
}

export interface PrepSlotEntry {
  accessNumber: number;          // #101..#130 (Cache Hit) or #200+ (Page Fault Synthesis)
  name: string;
  archetype: PrepArchetype;
  colorRgb: Rgb;
  stemColorRgb?: Rgb;
  scaleMultiplier: number;
}

export interface UniversalDishBlueprint {
  dishId: string;
  dishTitle: string;             // e.g., "MUSHROOM DUM BIRYANI"
  cuisineTag: string;            // e.g., "HYDERABADI DUM"
  // Dish lookup result (false = "not a real dish": every other field is then a harmless placeholder)
  found: boolean;
  notFoundMessage: string;       // default NOT_FOUND_MESSAGE
  // Timing & metrology
  prepDurationSec: number;
  searDurationSec: number;
  sauceDurationSec: number;
  cutSpacingCm: number;          // 0.4 to 2.0 cm
  cutAngleDeg: number;           // 0 (straight) or 45 (diagonal bias cut)
  cutLabel: string;              // e.g., "0.8cm Brunoise", "2.0cm 45deg Bias"
  // Page table access arrays (batch loaded by Loader A & Loader B)
  ingredientAccessNumbers: [number, number, number, number, number]; // = the 5 prepSlots, #101-#130 / #200+
  starchAccessNumbers: number[];  // 0-2 of #116-#121
  spiceAccessNumbers: number[];   // 0-4 of #160-#166
  vesselAccessNumbers: number[];  // cookware / prep ware / service ware, #301-#355, e.g. [302, 303, 325, 343]
  toolAccessNumbers: number[];    // knives / utensils, #301-#355 (#321-#336), e.g. [321, 332, 334]
  // 5-lane prep overrides
  prepSlots: [PrepSlotEntry, PrepSlotEntry, PrepSlotEntry, PrepSlotEntry, PrepSlotEntry];
  // Primary skillet / wok spec
  protein: {
    accessNumber: number;        // #140-#149 (old #110-#115 resolve as aliases) or #250+
    name: string;
    archetype: ProteinArchetype;
    primaryKine: PrimaryKinematicType;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    rawTopRgb: Rgb;
    searedCrustRgb: Rgb;
    flipCalloutText: string;     // e.g., "45 DEG ENTRY" or "PAN TOSS 180"
  };
  // Secondary saucier / handi two-pour spec
  sauce: {
    name: string;
    vesselAccessNumber: number;  // #304 Saucier or #303 Biryani Handi (#311 resolves as alias of #304)
    baseLiquidRgb: Rgb;
    reducedSauceRgb: Rgb;
    useLadleStir: boolean;       // Triggers #332 Ladle orbital stir on Pour 2
  };
  // 4-card cookbook briefing deck
  cookbookCards: [CookbookCardSpec, CookbookCardSpec, CookbookCardSpec, CookbookCardSpec];
  // 4-9 step flow (what + why per step)
  steps: StepSpec[];
  // AI vision context
  visionPromptContext: string;
  skilletPillVerb: string;       // e.g., "SEAR", "SAUTE", "CHAR"
  saucePillVerb: string;         // e.g., "SAUCE", "DUM", "GRAVY"
}

// ── JSON schema for Anthropic structured output (output_config.format = { type:"json_schema", schema }) ──
// Structured outputs reject numeric/string/array bound keywords (no min/max/minItems/maxLength), so ranges, lengths and
// tuple sizes (5 prep slots, 4 cards, 4-9 steps, 3-component colours) are enforced afterwards by
// ProposalGate.validateDishBlueprint. All properties are required; additionalProperties is false everywhere.

const S = { type: "string" };
const N = { type: "number" };
const B = { type: "boolean" };
const RGB = { type: "array", items: N };
const NUMS = { type: "array", items: N };

function obj(props: { [k: string]: any }): any {
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

export const PREP_ARCHETYPE_LIST: string[] = [
  "BULB_ALLIUM", "CYLINDER_STALK", "SPHERE_CROWN", "LEAFY_HERB", "CUBED_BLOCK", "GRANULAR",
  "GRANULAR_MOUND", "STRAND_TANGLE", "TUBE_ARRAY", "DISC_SHEET",
  "SPICE_CLUSTER", "LIQUID_SWIRL",
];
export const PROTEIN_ARCHETYPE_LIST: string[] = ["FILLET_SLAB", "MARBLED_STEAK", "MEDALLION_SCALLOP", "CUBED_SEAR", "DISC_SHEET"];
export const PRIMARY_KINE_LIST: string[] = ["KINE_SPATULA_FLIP_180", "KINE_PAN_TOSS_ROLL"];
export const KINEMATIC_ID_LIST: string[] = [
  "KINE_ROCK_CHOP", "KINE_TWO_STAGE_POUR", "KINE_SPATULA_FLIP_180", "KINE_PAN_TOSS_ROLL", "KINE_LADLE_ORBITAL_STIR",
  "KINE_NOODLE_LIFT_TOSS", "KINE_RICE_DUM_LAYER", "KINE_WHISK_EMULSION", "KINE_CONVERGENCE_PLATING",
];
export const STATION_LIST: string[] = ["PREP", "SKILLET", "SAUCEPOT", "PLATING"];

export const UniversalDishJsonSchema: any = obj({
  dishId: S,
  dishTitle: S,
  cuisineTag: S,
  found: B,
  notFoundMessage: S,
  prepDurationSec: N,
  searDurationSec: N,
  sauceDurationSec: N,
  cutSpacingCm: N,
  cutAngleDeg: N,
  cutLabel: S,
  ingredientAccessNumbers: NUMS,
  starchAccessNumbers: NUMS,
  spiceAccessNumbers: NUMS,
  vesselAccessNumbers: NUMS,
  toolAccessNumbers: NUMS,
  prepSlots: {
    type: "array",
    items: obj({
      accessNumber: N,
      name: S,
      archetype: { type: "string", enum: PREP_ARCHETYPE_LIST },
      colorRgb: RGB,
      stemColorRgb: RGB,
      scaleMultiplier: N,
    }),
  },
  protein: obj({
    accessNumber: N,
    name: S,
    archetype: { type: "string", enum: PROTEIN_ARCHETYPE_LIST },
    primaryKine: { type: "string", enum: PRIMARY_KINE_LIST },
    lengthCm: N,
    widthCm: N,
    heightCm: N,
    rawTopRgb: RGB,
    searedCrustRgb: RGB,
    flipCalloutText: S,
  }),
  sauce: obj({
    name: S,
    vesselAccessNumber: N,
    baseLiquidRgb: RGB,
    reducedSauceRgb: RGB,
    useLadleStir: B,
  }),
  cookbookCards: {
    type: "array",
    items: obj({
      stepNumber: N,
      stationFocus: { type: "string", enum: STATION_LIST },
      headline: S,
      instruction: S,
      masteryWhy: S,
    }),
  },
  steps: {
    type: "array",
    items: obj({
      id: S,
      station: { type: "string", enum: STATION_LIST },
      kinematic: { type: "string", enum: KINEMATIC_ID_LIST },
      durationSec: N,
      title: S,
      whatWhy: S,
    }),
  },
  visionPromptContext: S,
  skilletPillVerb: S,
  saucePillVerb: S,
});
