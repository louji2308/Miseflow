/**
 * PlanLibrary.ts  (Chef Director v6)
 *
 * Hand-authored CookPlan fixtures for the two acceptance dishes. They are found by alias BEFORE any API call, so the demo
 * can never fail on the network, and they double as test oracles: every plan here must pass sanitizeCookPlan with zero
 * errors and zero warnings (nothing for the sanitizer to repair). Pure TypeScript (no Lens APIs).
 *
 * Notes for CookStage / CookRuntime:
 *  - chicken pieces use catalogueHint 0 on purpose: the catalogue chicken (142) is cubed, chicken 65 needs irregular chunks.
 *  - chicken 65 DAG: coat runs beside heat_oil; deep_fry runs beside temper (second burner); saute_toss joins both; garnish follows plate.
 *  - chapathi DAG: heat_tawa runs beside roll_dough.
 */

import type { CookPlan } from "./CookPlanSchema";

export const CHICKEN_65_PLAN: CookPlan = {
  found: true,
  notFoundMessage: "",
  dishTitle: "Chicken 65",
  cuisineTag: "South Indian",
  equipment: [
    { id: "marinade_bowl", kind: "BOWL", role: "marinade bowl", burner: 0 },
    { id: "kadai", kind: "KADAI", role: "frying kadai", burner: 1 },
    { id: "tempering_pan", kind: "SKILLET", role: "small tempering pan", burner: 2 },
    { id: "plate", kind: "PLATE", role: "serving plate", burner: 0 },
  ],
  tools: [
    { id: "spoon", kind: "SPOON" },
    { id: "skimmer", kind: "SKIMMER" },
    { id: "spatula", kind: "SPATULA" },
  ],
  ingredients: [
    { id: "chicken", name: "boneless chicken", role: "PROTEIN", form: "irregular boneless bite-size chunks, never cubes", catalogueHint: 0, colorRaw: [0.95, 0.78, 0.7], colorDone: [0.88, 0.38, 0.12], amount: "500 g" },
    { id: "ginger_garlic", name: "ginger garlic paste", role: "AROMATIC", form: "pale beige paste", catalogueHint: 0, colorRaw: [0.85, 0.8, 0.5], colorDone: [0.8, 0.7, 0.35], amount: "1 tbsp" },
    { id: "curd", name: "curd (yogurt)", role: "DAIRY", form: "thick white curd", catalogueHint: 164, colorRaw: [0.97, 0.96, 0.9], colorDone: [0.95, 0.9, 0.8], amount: "3 tbsp" },
    { id: "spice_mix", name: "chilli, turmeric, masala", role: "SPICE", form: "red-orange spice powders", catalogueHint: 161, colorRaw: [0.85, 0.2, 0.1], colorDone: [0.8, 0.3, 0.1], amount: "2 tsp" },
    { id: "flours", name: "corn flour and rice flour", role: "FLOUR", form: "fine white flour dust", catalogueHint: 0, colorRaw: [0.97, 0.95, 0.88], colorDone: [0.95, 0.85, 0.6], amount: "3 tbsp" },
    { id: "oil", name: "frying oil", role: "OIL", form: "clear golden oil", catalogueHint: 165, colorRaw: [0.95, 0.8, 0.25], colorDone: [0.9, 0.65, 0.15], amount: "500 ml" },
    { id: "curry_leaves", name: "curry leaves", role: "GARNISH", form: "small glossy green leaves on a stem", catalogueHint: 0, colorRaw: [0.3, 0.7, 0.3], colorDone: [0.25, 0.6, 0.2], amount: "1 sprig" },
    { id: "green_chilli", name: "green chillies", role: "VEG", form: "slit slim green chillies", catalogueHint: 105, colorRaw: [0.3, 0.75, 0.25], colorDone: [0.35, 0.65, 0.2], amount: "3" },
    { id: "lemon", name: "lemon wedges", role: "GARNISH", form: "yellow lemon wedges", catalogueHint: 128, colorRaw: [0.98, 0.9, 0.25], colorDone: [0.98, 0.9, 0.25], amount: "1 lemon" },
  ],
  steps: [
    {
      id: "marinate", action: "MARINATE", title: "Marinate the chicken",
      whatWhy: "Coat the chunks in curd, ginger-garlic and spices; curd tenderises while the spices soak in.",
      equipmentId: "marinade_bowl", toolId: "spoon", ingredientIds: ["chicken", "ginger_garlic", "curd", "spice_mix"],
      fromId: "", toId: "", durationSec: 8, heat: "OFF", count: 0, after: [],
    },
    {
      id: "coat", action: "COAT", title: "Dredge in flour",
      whatWhy: "Toss in corn and rice flour; the dry coat crisps in oil instead of steaming.",
      equipmentId: "marinade_bowl", toolId: "spoon", ingredientIds: ["chicken", "flours"],
      fromId: "", toId: "", durationSec: 6, heat: "OFF", count: 0, after: ["marinate"],
    },
    {
      id: "heat_oil", action: "HEAT_OIL", title: "Heat the frying oil",
      whatWhy: "Bring the oil to about 175 C so the crust sets at once and the chicken stays juicy.",
      equipmentId: "kadai", toolId: "", ingredientIds: ["oil"],
      fromId: "", toId: "", durationSec: 6, heat: "HIGH", count: 0, after: ["marinate"],
    },
    {
      id: "deep_fry", action: "DEEP_FRY", title: "Deep fry in 2 batches",
      whatWhy: "Fry in two batches so the oil stays hot; crowding drops the temperature and makes it soggy.",
      equipmentId: "kadai", toolId: "skimmer", ingredientIds: ["chicken", "oil"],
      fromId: "marinade_bowl", toId: "", durationSec: 14, heat: "HIGH", count: 2, after: ["coat", "heat_oil"],
    },
    {
      id: "temper", action: "TEMPER", title: "Temper curry leaves",
      whatWhy: "Sizzle curry leaves and green chilli in hot oil; it releases their aroma for the finish.",
      equipmentId: "tempering_pan", toolId: "spoon", ingredientIds: ["curry_leaves", "green_chilli", "oil"],
      fromId: "", toId: "", durationSec: 8, heat: "MED", count: 0, after: ["heat_oil"],
    },
    {
      id: "saute_toss", action: "SAUTE_TOSS", title: "Toss everything together",
      whatWhy: "Toss the fried chicken with the tempering; heat coats every piece in the flavoured oil.",
      equipmentId: "kadai", toolId: "spatula", ingredientIds: ["chicken", "curry_leaves", "green_chilli"],
      fromId: "tempering_pan", toId: "", durationSec: 8, heat: "HIGH", count: 3, after: ["deep_fry", "temper"],
    },
    {
      id: "plate_dish", action: "PLATE", title: "Plate the chicken 65",
      whatWhy: "Lift the pieces onto the plate while crisp so steam does not soften the crust.",
      equipmentId: "plate", toolId: "skimmer", ingredientIds: ["chicken"],
      fromId: "kadai", toId: "", durationSec: 6, heat: "OFF", count: 0, after: ["saute_toss"],
    },
    {
      id: "garnish", action: "GARNISH", title: "Garnish with lemon",
      whatWhy: "Scatter curry leaves and add lemon; acid cuts the oil and brightens the spice.",
      equipmentId: "plate", toolId: "", ingredientIds: ["curry_leaves", "lemon"],
      fromId: "", toId: "", durationSec: 5, heat: "OFF", count: 0, after: ["plate_dish"],
    },
  ],
  plateEquipmentId: "plate",
  garnishIds: ["curry_leaves", "lemon"],
};

export const CHAPATHI_PLAN: CookPlan = {
  found: true,
  notFoundMessage: "",
  dishTitle: "Chapathi",
  cuisineTag: "Indian flatbread",
  equipment: [
    { id: "dough_bowl", kind: "BOWL", role: "dough bowl", burner: 0 },
    { id: "board", kind: "BOARD", role: "rolling board", burner: 0 },
    { id: "tawa", kind: "TAWA", role: "flat tawa", burner: 1 },
    { id: "plate", kind: "PLATE", role: "serving plate", burner: 0 },
  ],
  tools: [
    { id: "rolling_pin", kind: "ROLLING_PIN" },
    { id: "spatula", kind: "SPATULA" },
    { id: "brush", kind: "BRUSH" },
  ],
  ingredients: [
    { id: "atta", name: "whole wheat flour (atta)", role: "FLOUR", form: "fine tan wheat flour", catalogueHint: 0, colorRaw: [0.9, 0.78, 0.55], colorDone: [0.9, 0.78, 0.55], amount: "1 cup" },
    { id: "water", name: "water", role: "LIQUID", form: "clear water", catalogueHint: 0, colorRaw: [0.6, 0.8, 0.95], colorDone: [0.6, 0.8, 0.95], amount: "1/2 cup" },
    { id: "salt", name: "salt", role: "SPICE", form: "fine white crystals", catalogueHint: 0, colorRaw: [0.97, 0.97, 0.95], colorDone: [0.97, 0.97, 0.95], amount: "1/2 tsp" },
    { id: "oil", name: "oil", role: "OIL", form: "clear golden oil", catalogueHint: 165, colorRaw: [0.95, 0.8, 0.25], colorDone: [0.9, 0.65, 0.15], amount: "1 tsp" },
    { id: "ghee", name: "ghee", role: "DAIRY", form: "soft golden ghee", catalogueHint: 162, colorRaw: [0.98, 0.82, 0.3], colorDone: [0.98, 0.82, 0.3], amount: "1 tsp" },
    { id: "dough", name: "wheat dough", role: "DOUGH", form: "smooth round dough ball becoming a thin round disc", catalogueHint: 120, colorRaw: [0.92, 0.8, 0.58], colorDone: [0.85, 0.6, 0.3], amount: "1 ball" },
  ],
  steps: [
    {
      id: "mix", action: "MIX", title: "Mix the dough",
      whatWhy: "Bring atta, water, salt and oil together; water wakes up the gluten that makes it stretchy.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["atta", "water", "salt", "oil"],
      fromId: "", toId: "", durationSec: 7, heat: "OFF", count: 0, after: [],
    },
    {
      id: "knead", action: "KNEAD", title: "Knead until smooth",
      whatWhy: "Push and fold for a smooth dough; kneading builds gluten so the roti puffs and stays soft.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 9, heat: "OFF", count: 4, after: ["mix"],
    },
    {
      id: "rest", action: "REST", title: "Rest the dough",
      whatWhy: "Cover and rest; the gluten relaxes so the dough rolls thin without springing back.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 5, heat: "OFF", count: 0, after: ["knead"],
    },
    {
      id: "heat_tawa", action: "HEAT_OIL", title: "Heat the tawa",
      whatWhy: "Preheat the dry tawa while you roll; a hot surface puffs the roti fast and keeps it soft.",
      equipmentId: "tawa", toolId: "", ingredientIds: [],
      fromId: "", toId: "", durationSec: 6, heat: "MED", count: 0, after: ["rest"],
    },
    {
      id: "roll", action: "ROLL_DOUGH", title: "Roll into a thin disc",
      whatWhy: "Roll from the centre outward, turning often; an even disc cooks evenly and puffs.",
      equipmentId: "board", toolId: "rolling_pin", ingredientIds: ["dough"],
      fromId: "dough_bowl", toId: "", durationSec: 10, heat: "OFF", count: 4, after: ["rest"],
    },
    {
      id: "cook_side_one", action: "COOK_FLAT", title: "Cook the first side",
      whatWhy: "Cook until small bubbles rise; that sets the first side while the inside steams.",
      equipmentId: "tawa", toolId: "", ingredientIds: ["dough"],
      fromId: "board", toId: "", durationSec: 8, heat: "MED", count: 0, after: ["heat_tawa", "roll"],
    },
    {
      id: "flip", action: "FLIP", title: "Flip the chapathi",
      whatWhy: "Flip once bubbles appear so the second side browns and the steam inside builds.",
      equipmentId: "tawa", toolId: "spatula", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 4, heat: "MED", count: 0, after: ["cook_side_one"],
    },
    {
      id: "cook_side_two", action: "COOK_FLAT", title: "Cook the second side",
      whatWhy: "Brown the second side until it blisters and puffs; trapped steam makes it soft.",
      equipmentId: "tawa", toolId: "", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 8, heat: "MED", count: 0, after: ["flip"],
    },
    {
      id: "ghee_brush", action: "SEASON", title: "Brush with ghee",
      whatWhy: "Brush hot ghee on top; the fat keeps the chapathi soft and adds a nutty flavour.",
      equipmentId: "tawa", toolId: "brush", ingredientIds: ["ghee"],
      fromId: "", toId: "", durationSec: 5, heat: "LOW", count: 0, after: ["cook_side_two"],
    },
    {
      id: "plate_dish", action: "PLATE", title: "Plate the chapathi",
      whatWhy: "Move it to the plate while hot; stacking traps steam so the chapathi stays soft.",
      equipmentId: "plate", toolId: "spatula", ingredientIds: ["dough"],
      fromId: "tawa", toId: "", durationSec: 6, heat: "OFF", count: 0, after: ["ghee_brush"],
    },
  ],
  plateEquipmentId: "plate",
  garnishIds: [],
};

/** Poori: rolled small discs that fit the oil, puff and float, flip INSIDE the kadai, and are lifted straight onto the plate. */
export const POORI_PLAN: CookPlan = {
  found: true,
  notFoundMessage: "",
  dishTitle: "Poori",
  cuisineTag: "North Indian",
  equipment: [
    { id: "dough_bowl", kind: "BOWL", role: "dough bowl", burner: 0 },
    { id: "board", kind: "BOARD", role: "rolling board", burner: 0 },
    { id: "kadai", kind: "KADAI", role: "frying kadai", burner: 1 },
    { id: "plate", kind: "PLATE", role: "serving plate", burner: 0 },
  ],
  tools: [
    { id: "rolling_pin", kind: "ROLLING_PIN" },
    { id: "skimmer", kind: "SKIMMER" },
  ],
  ingredients: [
    { id: "atta", name: "whole wheat flour (atta)", role: "FLOUR", form: "fine tan wheat flour", catalogueHint: 0, colorRaw: [0.9, 0.78, 0.55], colorDone: [0.9, 0.78, 0.55], amount: "1 cup" },
    { id: "water", name: "water", role: "LIQUID", form: "clear water", catalogueHint: 0, colorRaw: [0.6, 0.8, 0.95], colorDone: [0.6, 0.8, 0.95], amount: "1/2 cup" },
    { id: "salt", name: "salt", role: "SPICE", form: "fine white crystals", catalogueHint: 0, colorRaw: [0.97, 0.97, 0.95], colorDone: [0.97, 0.97, 0.95], amount: "1/2 tsp" },
    { id: "oil", name: "frying oil", role: "OIL", form: "clear golden oil", catalogueHint: 165, colorRaw: [0.95, 0.8, 0.25], colorDone: [0.9, 0.65, 0.15], amount: "500 ml" },
    { id: "dough", name: "poori dough", role: "DOUGH", form: "stiff round dough ball becoming a small thin round disc", catalogueHint: 120, colorRaw: [0.92, 0.8, 0.58], colorDone: [0.9, 0.58, 0.2], amount: "1 ball" },
  ],
  steps: [
    {
      id: "mix", action: "MIX", title: "Mix the dough",
      whatWhy: "Bring atta, water and salt together; poori dough is kept stiff so it does not soak up oil.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["atta", "water", "salt"],
      fromId: "", toId: "", durationSec: 6, heat: "OFF", count: 0, after: [],
    },
    {
      id: "knead", action: "KNEAD", title: "Knead a stiff dough",
      whatWhy: "Knead firmly; a stiff dough puffs into a hollow ball when it hits hot oil.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 8, heat: "OFF", count: 4, after: ["mix"],
    },
    {
      id: "rest", action: "REST", title: "Rest the dough",
      whatWhy: "Rest it covered so the gluten relaxes and the discs roll out evenly.",
      equipmentId: "dough_bowl", toolId: "", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 4, heat: "OFF", count: 0, after: ["knead"],
    },
    {
      id: "heat_oil", action: "HEAT_OIL", title: "Heat the frying oil",
      whatWhy: "The oil must be hot before the first disc goes in, or the poori turns heavy and oily.",
      equipmentId: "kadai", toolId: "", ingredientIds: ["oil"],
      fromId: "", toId: "", durationSec: 6, heat: "HIGH", count: 0, after: ["rest"],
    },
    {
      id: "roll", action: "ROLL_DOUGH", title: "Roll a small disc",
      whatWhy: "Roll a small, even disc; an even thickness is what lets it puff up all the way round.",
      equipmentId: "board", toolId: "rolling_pin", ingredientIds: ["dough"],
      fromId: "dough_bowl", toId: "", durationSec: 8, heat: "OFF", count: 4, after: ["rest"],
    },
    {
      id: "fry_first", action: "DEEP_FRY", title: "Fry the first side",
      whatWhy: "Slide the disc in and press it down gently; it puffs and floats within seconds.",
      equipmentId: "kadai", toolId: "skimmer", ingredientIds: ["dough", "oil"],
      fromId: "board", toId: "", durationSec: 6, heat: "HIGH", count: 1, after: ["roll", "heat_oil"],
    },
    {
      id: "flip", action: "FLIP", title: "Flip the poori",
      whatWhy: "Turn it over in the oil once it puffs so the other side turns golden too.",
      equipmentId: "kadai", toolId: "skimmer", ingredientIds: ["dough"],
      fromId: "", toId: "", durationSec: 4, heat: "HIGH", count: 0, after: ["fry_first"],
    },
    {
      id: "fry_second", action: "DEEP_FRY", title: "Fry the second side and lift out",
      whatWhy: "Fry until evenly golden, then lift it out, drain it over the kadai and carry it to the plate.",
      equipmentId: "kadai", toolId: "skimmer", ingredientIds: ["dough", "oil"],
      fromId: "", toId: "", durationSec: 7, heat: "HIGH", count: 1, after: ["flip"],
    },
    {
      id: "plate_dish", action: "PLATE", title: "Serve the poori",
      whatWhy: "Serve it at once; a poori deflates and goes soft as it cools.",
      equipmentId: "plate", toolId: "", ingredientIds: ["dough"],
      fromId: "kadai", toId: "", durationSec: 3, heat: "OFF", count: 0, after: ["fry_second"],
    },
  ],
  plateEquipmentId: "plate",
  garnishIds: [],
};

/** Every fixture, in lookup order. */
export const LIBRARY_PLANS: CookPlan[] = [CHICKEN_65_PLAN, CHAPATHI_PLAN, POORI_PLAN];

/** Normalised aliases -> fixture. Keys go through normalizeQuery, so write them in plain lowercase words. */
const ALIASES: { [alias: string]: CookPlan } = Object.create(null);
function addAliases(plan: CookPlan, names: string[]): void {
  for (let i = 0; i < names.length; i++) ALIASES[normalizeQuery(names[i])] = plan;
}

const FILLER: string[] = [
  "a", "an", "the", "of", "to", "for", "me", "my", "some", "i", "we", "want", "wanna", "make", "making", "cook", "cooking",
  "how", "recipe", "recipes", "please", "dish", "homemade", "home", "style", "with", "and", "show", "teach", "learn",
];

/** lowercase, ASCII words only, "chicken65" -> "chicken 65", filler/articles removed, single spaces. */
export function normalizeQuery(query: string): string {
  let q = String(query === undefined || query === null ? "" : query).toLowerCase();
  q = q.replace(/[^a-z0-9\s]/g, " ").replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2");
  const words = q.split(/\s+/).filter((w) => w.length > 0);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) if (FILLER.indexOf(words[i]) < 0) kept.push(words[i]);
  return kept.join(" ");
}

addAliases(CHICKEN_65_PLAN, ["chicken 65", "chicken65", "chicken sixty five", "chicken sixtyfive", "chicken 65 recipe", "hyderabadi chicken 65", "andhra chicken 65"]);
addAliases(POORI_PLAN, ["poori", "puri", "pooris", "puris", "poori recipe", "puri recipe", "fried puri", "fried poori"]);
addAliases(CHAPATHI_PLAN, [
  "chapathi", "chapati", "chappathi", "chapatti", "chapathis", "chapatis", "roti", "rotis", "phulka", "phulkas", "fulka",
  "wheat roti", "indian flatbread", "indian flat bread", "whole wheat roti",
]);

/**
 * Finds a hand-authored plan for a typed dish ("Chicken-65!", "the chapati recipe", "roti"). Exact match on the normalised
 * text only (so "paneer roti roll" is NOT a chapathi). Returns a deep copy (callers may mutate) or null.
 */
export function lookupPlan(query: string): CookPlan | null {
  const key = normalizeQuery(query);
  if (key.length === 0) return null;
  const hit = ALIASES[key];
  return hit ? (JSON.parse(JSON.stringify(hit)) as CookPlan) : null;
}
