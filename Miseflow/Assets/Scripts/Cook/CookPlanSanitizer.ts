/**
 * CookPlanSanitizer.ts  (Chef Director v6)
 *
 * Pure TypeScript (no Lens APIs) so a node script can import it. Turns ANY raw object (AI output, a fixture, garbage)
 * into a CookPlan that satisfies every invariant CookStage / CookRuntime rely on, or reports why it cannot.
 * It never throws: clamp and repair first, `errors` only when no usable plan can be made (then plan === null).
 *
 * Guarantees for a plan returned with ok === true and found === true (checked again by validateCookPlan):
 *  - text limits (dishTitle 32, cuisineTag 24, step title 28, whatWhy 110); ids are unique snake_case
 *  - equipment 1..6 with exactly one PLATE, burner 0..3 and no two vessels on the same nonzero burner
 *  - tools 0..4, ingredients 1..12, colours are 3 numbers in 0..1 with channel sum >= 0.45 (additive display)
 *  - steps 3..14, every reference (equipment, tool, ingredient, from/to, after) points at a defined id
 *  - `after` is a full acyclic DAG: an empty `after` ("after the previous step in the list") is materialised explicitly,
 *    PLATE joins every parallel branch, steps listed after PLATE (GARNISH) depend on PLATE
 *  - a PLATE step on the plate exists and the last step is that PLATE or a GARNISH after it
 *  - unreferenced tools / ingredients / equipment are dropped (the stage loads ONLY what the steps need)
 */

import { COOK_ACTIONS, EQUIPMENT_KINDS, HEAT_LEVELS, INGREDIENT_ROLES, NOT_FOUND_TEXT, TOOL_KINDS } from "./CookPlanSchema";
import type { CookEquipment, CookIngredient, CookPlan, CookStep, CookTool } from "./CookPlanSchema";

export interface SanitizeResult {
  ok: boolean;
  plan: CookPlan | null;
  errors: string[];
  warnings: string[];
}

export const PLAN_LIMITS = {
  dishTitle: 32,
  cuisineTag: 24,
  stepTitle: 28,
  whatWhy: 110,
  roleText: 40,
  ingredientName: 28,
  form: 60,
  amount: 24,
  idLen: 24,
  equipmentMax: 6,
  toolsMax: 4,
  ingredientsMax: 12,
  stepsMin: 3,
  stepsMax: 14,
  durationMin: 2,
  durationMax: 20,
  countMax: 6,
  burnerMax: 3,
  minColorSum: 0.45,
};

// ── small exported helpers ───────────────────────────────────────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** lowercase snake_case id, starts with a letter, <= max chars; `fallback` when nothing usable remains. */
export function snakeId(s: any, fallback: string, max: number = PLAN_LIMITS.idLen): string {
  let t = typeof s === "string" ? s : typeof s === "number" ? String(s) : "";
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (t.length > max) t = t.substring(0, max).replace(/_+$/g, "");
  if (t.length === 0) t = fallback;
  if (/^[0-9]/.test(t)) t = ("n_" + t).substring(0, max);
  return t;
}

/** Reserves and returns a unique id (suffix _2, _3...) in `used` (a prototype-free map). */
export function uniqueId(base: string, used: any, max: number = PLAN_LIMITS.idLen): string {
  let id = base.length > 0 ? base : "item";
  let n = 2;
  while (used[id] === true) {
    const suffix = "_" + n;
    id = id.substring(0, Math.max(1, max - suffix.length)) + suffix;
    n++;
  }
  used[id] = true;
  return id;
}

/** Raises near-black colours (hue preserved) so r+g+b >= minSum: the additive display shows black as invisible. */
export function liftColor(c: number[], minSum: number = PLAN_LIMITS.minColorSum): number[] {
  const r = clamp(c[0], 0, 1);
  const g = clamp(c[1], 0, 1);
  const b = clamp(c[2], 0, 1);
  const sum = r + g + b;
  if (sum >= minSum) return [r, g, b];
  if (sum <= 1e-6) {
    const v = round3((minSum + 0.01) / 3);
    return [v, v, v];
  }
  const k = (minSum + 0.01) / sum;
  return [round3(Math.min(1, r * k)), round3(Math.min(1, g * k)), round3(Math.min(1, b * k))];
}

export function notFoundPlan(message?: string): CookPlan {
  const m = typeof message === "string" && message.trim().length > 0 && message.trim().length <= 90 ? message.trim() : NOT_FOUND_TEXT;
  return {
    found: false,
    notFoundMessage: m,
    dishTitle: "",
    cuisineTag: "",
    equipment: [],
    tools: [],
    ingredients: [],
    steps: [],
    plateEquipmentId: "",
    garnishIds: [],
  };
}

// ── private helpers ──────────────────────────────────────────────────────────────────────────────────────────────

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function newMap(): any {
  return Object.create(null);
}

function isObj(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Number from a number or a numeric string; NaN for anything else (null, "", booleans). */
function num(v: any): number {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  return NaN;
}

function norm(s: any): string {
  return typeof s === "string" || typeof s === "number" ? String(s).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function upperToken(s: any): string {
  return typeof s === "string" ? s.trim().toUpperCase().replace(/[\s\-]+/g, "_") : "";
}

function humanize(token: string): string {
  const t = token.toLowerCase().replace(/_/g, " ");
  return t.length > 0 ? t.charAt(0).toUpperCase() + t.substring(1) : "Step";
}

type Warn = (m: string) => void;

function cleanText(v: any, max: number, fallback: string, what: string, warn: Warn): string {
  let t = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  t = t
    .replace(/[‒-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length === 0) return fallback;
  if (t.length > max) {
    let cut = t.substring(0, max);
    const sp = cut.lastIndexOf(" ");
    if (sp >= Math.floor(max * 0.6)) cut = cut.substring(0, sp);
    cut = cut.replace(/[\s,;:\-]+$/, "");
    warn(what + " truncated to " + max + " chars");
    t = cut.length > 0 ? cut : t.substring(0, max);
  }
  return t;
}

interface RefEntry {
  id: string;
  keys: string[];
}

/** Maps a model-written reference to a final id: exact id, normalised raw id/name, then (fuzzy) a unique substring match. */
function resolveRef(ref: any, entries: RefEntry[], fuzzy: boolean): string {
  if (typeof ref !== "string" && typeof ref !== "number") return "";
  const raw = String(ref);
  const n = norm(raw);
  if (n.length === 0) return "";
  for (let i = 0; i < entries.length; i++) if (entries[i].id === raw) return entries[i].id;
  for (let i = 0; i < entries.length; i++) if (entries[i].keys.indexOf(n) >= 0) return entries[i].id;
  if (fuzzy && n.length >= 4) {
    let found = "";
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let k = 0; k < entries[i].keys.length; k++) {
        const key = entries[i].keys[k];
        if (key.length >= 4 && (key.indexOf(n) >= 0 || n.indexOf(key) >= 0)) {
          if (found !== entries[i].id) {
            found = entries[i].id;
            count++;
          }
          break;
        }
      }
    }
    if (count === 1) return found;
  }
  return "";
}

function inList(list: string[], v: string): boolean {
  return list.indexOf(v) >= 0;
}

const KIND_HINTS: string[][] = [
  ["PLATE", "PLATE"], ["SERVING", "PLATE"], ["DISH", "PLATE"], ["BOARD", "BOARD"], ["BOWL", "BOWL"], ["TAWA", "TAWA"],
  ["GRIDDLE", "TAWA"], ["KADAI", "KADAI"], ["KADHAI", "KADAI"], ["WOK", "WOK"], ["SKILLET", "SKILLET"],
  ["FRY", "FRYER_PAN"], ["PAN", "SKILLET"], ["SAUCE", "SAUCEPAN"], ["POT", "POT"], ["STEAM", "STEAMER"],
  ["HANDI", "HANDI"], ["DUM", "HANDI"],
];
const TOOL_HINTS: string[][] = [
  ["SPATULA", "SPATULA"], ["TURNER", "SPATULA"], ["LADLE", "LADLE"], ["TONG", "TONGS"], ["WHISK", "WHISK"],
  ["SPOON", "SPOON"], ["ROLL", "ROLLING_PIN"], ["PIN", "ROLLING_PIN"], ["KNIFE", "KNIFE"], ["CLEAVER", "KNIFE"],
  ["SKIM", "SKIMMER"], ["CHOPSTICK", "CHOPSTICKS"], ["BRUSH", "BRUSH"],
];
const ACTION_ALIASES: { [a: string]: string } = {
  FRY: "SHALLOW_FRY", PAN_FRY: "SHALLOW_FRY", STIR_FRY: "SAUTE_TOSS", SAUTE: "SAUTE_TOSS", TOSS: "SAUTE_TOSS",
  STIR: "SAUTE_TOSS", CHOP: "CUT", SLICE: "CUT", DICE: "CUT", MINCE: "CUT", SERVE: "PLATE", PLATING: "PLATE",
  SPRINKLE: "SEASON", ROLL: "ROLL_DOUGH", DEEPFRY: "DEEP_FRY", TEMPERING: "TEMPER", MARINADE: "MARINATE",
  BATTER: "COAT", DREDGE: "COAT", DUM: "STEAM_DUM", STEAM: "STEAM_DUM", HEAT: "HEAT_OIL", PREHEAT: "HEAT_OIL",
};
const ROLE_NAME_HINTS: string[][] = [
  ["OIL", "oil"], ["OIL", "ghee"], ["DAIRY", "butter"], ["DAIRY", "curd"], ["DAIRY", "yogurt"], ["DAIRY", "yoghurt"],
  ["DAIRY", "cream"], ["DAIRY", "cheese"], ["DAIRY", "milk"], ["DAIRY", "paneer"], ["FLOUR", "flour"], ["FLOUR", "atta"],
  ["FLOUR", "starch"], ["FLOUR", "semolina"], ["DOUGH", "dough"], ["DOUGH", "batter"], ["LIQUID", "water"],
  ["LIQUID", "stock"], ["LIQUID", "broth"], ["LIQUID", "juice"], ["LIQUID", "sauce"], ["LIQUID", "vinegar"],
  ["SPICE", "masala"], ["SPICE", "powder"], ["SPICE", "salt"], ["SPICE", "pepper"], ["SPICE", "turmeric"],
  ["SPICE", "cumin"], ["SPICE", "chilli"], ["SPICE", "chili"], ["SPICE", "spice"], ["AROMATIC", "garlic"],
  ["AROMATIC", "ginger"], ["AROMATIC", "onion"], ["AROMATIC", "shallot"], ["GARNISH", "leaves"], ["GARNISH", "leaf"],
  ["GARNISH", "coriander"], ["GARNISH", "parsley"], ["GARNISH", "mint"], ["GARNISH", "lemon"], ["GARNISH", "lime"],
  ["PROTEIN", "chicken"], ["PROTEIN", "fish"], ["PROTEIN", "salmon"], ["PROTEIN", "prawn"], ["PROTEIN", "egg"],
  ["PROTEIN", "lamb"], ["PROTEIN", "mutton"], ["PROTEIN", "beef"], ["PROTEIN", "pork"], ["PROTEIN", "tofu"],
];
const DEFAULT_COLORS: { [role: string]: number[] } = {
  PROTEIN: [0.85, 0.55, 0.5], VEG: [0.45, 0.7, 0.3], FLOUR: [0.9, 0.85, 0.7], LIQUID: [0.6, 0.75, 0.85],
  OIL: [0.9, 0.75, 0.25], SPICE: [0.8, 0.3, 0.15], DOUGH: [0.9, 0.8, 0.6], GARNISH: [0.4, 0.75, 0.35],
  AROMATIC: [0.85, 0.75, 0.5], DAIRY: [0.95, 0.93, 0.85],
};
/** Preferred equipment kinds per action (first match in plan order), used when a step names no valid equipment. */
const ACTION_KINDS: { [a: string]: string[] } = {
  CUT: ["BOARD", "BOWL"], MARINATE: ["BOWL"], MIX: ["BOWL", "POT"], COAT: ["BOWL", "BOARD"],
  HEAT_OIL: ["KADAI", "WOK", "SKILLET", "FRYER_PAN", "TAWA", "POT", "SAUCEPAN", "HANDI"],
  DEEP_FRY: ["KADAI", "WOK", "FRYER_PAN", "POT", "SKILLET"],
  SHALLOW_FRY: ["SKILLET", "TAWA", "FRYER_PAN", "KADAI", "WOK"],
  SAUTE_TOSS: ["KADAI", "WOK", "SKILLET", "FRYER_PAN", "POT"],
  TEMPER: ["SKILLET", "SAUCEPAN", "FRYER_PAN", "KADAI"],
  SIMMER: ["POT", "HANDI", "SAUCEPAN", "KADAI", "SKILLET"], BOIL: ["POT", "SAUCEPAN", "HANDI"],
  ROLL_DOUGH: ["BOARD"], KNEAD: ["BOWL", "BOARD"], COOK_FLAT: ["TAWA", "SKILLET", "FRYER_PAN"],
  FLIP: ["TAWA", "SKILLET", "FRYER_PAN", "KADAI", "WOK"], STEAM_DUM: ["HANDI", "STEAMER", "POT"],
  WHISK: ["BOWL"], POUR: ["BOWL", "POT", "SAUCEPAN"], SEASON: ["BOWL", "KADAI", "SKILLET", "POT"],
  REST: ["BOWL", "BOARD"], PLATE: ["PLATE"], GARNISH: ["PLATE"], GENERIC: ["BOWL"],
};
const DEFAULT_DURATION: { [a: string]: number } = {
  CUT: 6, MARINATE: 8, MIX: 6, COAT: 6, HEAT_OIL: 6, DEEP_FRY: 12, SHALLOW_FRY: 10, SAUTE_TOSS: 8, TEMPER: 7,
  SIMMER: 10, BOIL: 10, ROLL_DOUGH: 9, KNEAD: 9, COOK_FLAT: 8, FLIP: 4, STEAM_DUM: 10, WHISK: 6, POUR: 5, SEASON: 4,
  REST: 5, PLATE: 6, GARNISH: 4, GENERIC: 6,
};
const HEATED_ACTIONS: string[] = ["HEAT_OIL", "DEEP_FRY", "SHALLOW_FRY", "SAUTE_TOSS", "TEMPER", "SIMMER", "BOIL", "COOK_FLAT", "STEAM_DUM"];
const NO_BURNER_KINDS: string[] = ["BOWL", "PLATE", "BOARD"];

function fixKind(v: any, valid: string[], hints: string[][], fallback: string, what: string, warn: Warn): string {
  const u = upperToken(v);
  if (inList(valid, u)) return u;
  for (let i = 0; i < hints.length; i++) {
    if (u.indexOf(hints[i][0]) >= 0) {
      warn(what + " kind '" + String(v) + "' mapped to " + hints[i][1]);
      return hints[i][1];
    }
  }
  warn(what + " kind '" + String(v) + "' unknown -> " + fallback);
  return fallback;
}

function fixAction(v: any, what: string, warn: Warn): string {
  const u = upperToken(v);
  if (u === "GENERIC" || inList(COOK_ACTIONS, u)) return u;
  if (ACTION_ALIASES[u] !== undefined) {
    warn(what + " action '" + String(v) + "' mapped to " + ACTION_ALIASES[u]);
    return ACTION_ALIASES[u];
  }
  warn(what + " action '" + String(v) + "' unknown -> GENERIC");
  return "GENERIC";
}

function fixHeat(v: any): string {
  const u = upperToken(v);
  if (inList(HEAT_LEVELS, u)) return u;
  if (u.indexOf("HIGH") === 0 || u === "HI" || u === "MAX") return "HIGH";
  if (u.indexOf("MED") === 0) return "MED";
  if (u.indexOf("LOW") === 0 || u === "SIMMER") return "LOW";
  return "OFF";
}

function guessRole(name: string): string {
  const n = name.toLowerCase();
  for (let i = 0; i < ROLE_NAME_HINTS.length; i++) if (n.indexOf(ROLE_NAME_HINTS[i][1]) >= 0) return ROLE_NAME_HINTS[i][0];
  return "VEG";
}

/** [r,g,b] in 0..1 (0..255 values are rescaled) or null when the value is not a usable colour. */
function parseColor(v: any): number[] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = [num(v[0]), num(v[1]), num(v[2])];
  for (let i = 0; i < 3; i++) if (isNaN(a[i])) return null;
  const mx = Math.max(a[0], a[1], a[2]);
  if (mx > 1 && mx <= 255) for (let i = 0; i < 3; i++) a[i] = a[i] / 255;
  return [round3(clamp(a[0], 0, 1)), round3(clamp(a[1], 0, 1)), round3(clamp(a[2], 0, 1))];
}

function fixColor(v: any, fallback: number[], what: string, warn: Warn): number[] {
  const parsed = parseColor(v);
  if (!parsed) {
    warn(what + " colour missing/invalid -> default");
    return liftColor(fallback);
  }
  const lifted = liftColor(parsed);
  if (lifted[0] !== parsed[0] || lifted[1] !== parsed[1] || lifted[2] !== parsed[2]) warn(what + " colour lifted (too dark for the additive display)");
  return lifted;
}

function findKind(equipment: CookEquipment[], kinds: string[]): string {
  for (let k = 0; k < kinds.length; k++) {
    for (let i = 0; i < equipment.length; i++) if (equipment[i].kind === kinds[k]) return equipment[i].id;
  }
  return "";
}

/** true when `from` (step index) transitively depends on `target` through deps; from === target counts. */
function reaches(deps: number[][], from: number, target: number): boolean {
  const seen: boolean[] = [];
  const stack: number[] = [from];
  while (stack.length > 0) {
    const n = stack.pop() as number;
    if (n === target) return true;
    if (seen[n]) continue;
    seen[n] = true;
    for (let i = 0; i < deps[n].length; i++) stack.push(deps[n][i]);
  }
  return false;
}

function pushUnique(list: number[], v: number): void {
  if (list.indexOf(v) < 0) list.push(v);
}

interface WorkStep {
  rawId: string;
  afterRaw: any[];
  step: CookStep;
}

// ── main entry ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Clamp/repair `raw` into a CookPlan. Never throws. found:false gives ok === true with a notFound plan. */
export function sanitizeCookPlan(raw: any): SanitizeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    return sanitizeInner(raw, errors, warnings);
  } catch (e) {
    errors.push("sanitizer exception: " + String(e));
    return { ok: false, plan: null, errors: errors, warnings: warnings };
  }
}

function sanitizeInner(input: any, errors: string[], warnings: string[]): SanitizeResult {
  const warn: Warn = (m: string) => {
    if (warnings.length < 60) warnings.push(m);
  };
  const fail = (): SanitizeResult => ({ ok: false, plan: null, errors: errors, warnings: warnings });

  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_e) {
      errors.push("plan is not valid JSON");
      return fail();
    }
  }
  if (!isObj(raw)) {
    errors.push("plan is not an object");
    return fail();
  }
  if (raw.found === false || raw.found === "false") {
    return { ok: true, plan: notFoundPlan(raw.notFoundMessage), errors: errors, warnings: warnings };
  }

  const dishTitle = cleanText(raw.dishTitle, PLAN_LIMITS.dishTitle, "", "dishTitle", warn);
  const cuisineTag = cleanText(raw.cuisineTag, PLAN_LIMITS.cuisineTag, "", "cuisineTag", warn);

  // ── A. equipment ──
  const eqRaw: any[] = Array.isArray(raw.equipment) ? raw.equipment.slice(0, 24) : [];
  const usedEq = newMap();
  let equipment: CookEquipment[] = [];
  let eqEntries: RefEntry[] = [];
  let plateSeen = false;
  for (let i = 0; i < eqRaw.length; i++) {
    const e = eqRaw[i];
    if (!isObj(e)) {
      warn("equipment[" + i + "] is not an object, dropped");
      continue;
    }
    let kind = fixKind(e.kind, EQUIPMENT_KINDS, KIND_HINTS, "BOWL", "equipment[" + i + "]", warn);
    if (kind === "PLATE") {
      if (plateSeen) {
        warn("second PLATE '" + String(e.id) + "' converted to BOWL (exactly one plate)");
        kind = "BOWL";
      }
      plateSeen = true;
    }
    const id = uniqueId(snakeId(e.id, kind.toLowerCase()), usedEq);
    const role = cleanText(e.role, PLAN_LIMITS.roleText, kind.toLowerCase(), "equipment role", warn);
    let burner = num(e.burner);
    burner = isNaN(burner) ? 0 : Math.round(clamp(burner, 0, PLAN_LIMITS.burnerMax));
    equipment.push({ id: id, kind: kind, role: role, burner: burner });
    eqEntries.push({ id: id, keys: [norm(e.id), norm(role)].filter((k) => k.length > 0) });
  }
  if (!plateSeen) {
    const id = uniqueId("plate", usedEq);
    equipment.push({ id: id, kind: "PLATE", role: "serving plate", burner: 0 });
    eqEntries.push({ id: id, keys: ["plate", "servingplate"] });
    warn("no PLATE in equipment, added '" + id + "'");
  }
  if (equipment.length > PLAN_LIMITS.equipmentMax) {
    const keep: CookEquipment[] = [];
    const plate = equipment.filter((q) => q.kind === "PLATE")[0];
    for (let i = 0; i < equipment.length && keep.length < PLAN_LIMITS.equipmentMax - 1; i++) if (equipment[i] !== plate) keep.push(equipment[i]);
    keep.push(plate);
    warn("equipment capped to " + PLAN_LIMITS.equipmentMax + " (dropped " + (equipment.length - keep.length) + ")");
    equipment = keep;
    eqEntries = eqEntries.filter((q) => equipment.some((p) => p.id === q.id));
  }
  if (equipment.filter((q) => q.kind !== "PLATE").length === 0) {
    const id = uniqueId("mixing_bowl", usedEq);
    equipment.unshift({ id: id, kind: "BOWL", role: "mixing bowl", burner: 0 });
    eqEntries.unshift({ id: id, keys: ["mixingbowl", "bowl"] });
    warn("no cooking/prep vessel in equipment, added '" + id + "'");
  }
  const plateId = equipment.filter((q) => q.kind === "PLATE")[0].id;
  const eqById = newMap();
  for (let i = 0; i < equipment.length; i++) eqById[equipment[i].id] = equipment[i];

  // ── B. tools ──
  const toolRaw: any[] = Array.isArray(raw.tools) ? raw.tools.slice(0, 24) : [];
  const usedTool = newMap();
  let tools: CookTool[] = [];
  let toolEntries: RefEntry[] = [];
  for (let i = 0; i < toolRaw.length; i++) {
    const t = toolRaw[i];
    if (!isObj(t)) {
      warn("tools[" + i + "] is not an object, dropped");
      continue;
    }
    const kind = fixKind(t.kind, TOOL_KINDS, TOOL_HINTS, "SPOON", "tools[" + i + "]", warn);
    const id = uniqueId(snakeId(t.id, kind.toLowerCase()), usedTool);
    tools.push({ id: id, kind: kind });
    toolEntries.push({ id: id, keys: [norm(t.id), norm(kind)].filter((k) => k.length > 0) });
  }
  if (tools.length > PLAN_LIMITS.toolsMax) {
    warn("tools capped to " + PLAN_LIMITS.toolsMax);
    tools = tools.slice(0, PLAN_LIMITS.toolsMax);
    toolEntries = toolEntries.filter((q) => tools.some((p) => p.id === q.id));
  }

  // ── C. ingredients ──
  const ingRaw: any[] = Array.isArray(raw.ingredients) ? raw.ingredients.slice(0, 40) : [];
  const usedIng = newMap();
  let ingredients: CookIngredient[] = [];
  let ingEntries: RefEntry[] = [];
  for (let i = 0; i < ingRaw.length; i++) {
    const g = ingRaw[i];
    if (!isObj(g)) {
      warn("ingredients[" + i + "] is not an object, dropped");
      continue;
    }
    const name = cleanText(g.name, PLAN_LIMITS.ingredientName, "", "ingredient name", warn) || cleanText(g.id, PLAN_LIMITS.ingredientName, "ingredient " + (i + 1), "ingredient name", warn);
    let role = upperToken(g.role);
    if (!inList(INGREDIENT_ROLES, role)) {
      const guess = guessRole(name);
      warn("ingredient '" + name + "' role '" + String(g.role) + "' unknown -> " + guess);
      role = guess;
    }
    const id = uniqueId(snakeId(g.id !== undefined && g.id !== "" ? g.id : name, "ingredient"), usedIng);
    const form = cleanText(g.form, PLAN_LIMITS.form, name, "ingredient form", warn);
    let hint = num(g.catalogueHint);
    hint = isNaN(hint) ? 0 : Math.round(hint);
    if (hint !== 0 && (hint < 101 || hint > 299)) hint = 0;
    const base = DEFAULT_COLORS[role] || DEFAULT_COLORS.VEG;
    const colorRaw = fixColor(g.colorRaw, base, "'" + name + "' colorRaw", warn);
    const colorDone = fixColor(g.colorDone, parseColor(g.colorRaw) ? colorRaw : base, "'" + name + "' colorDone", warn);
    const amount = cleanText(g.amount, PLAN_LIMITS.amount, "", "ingredient amount", warn);
    ingredients.push({ id: id, name: name, role: role, form: form, catalogueHint: hint, colorRaw: colorRaw, colorDone: colorDone, amount: amount });
    ingEntries.push({ id: id, keys: [norm(g.id), norm(name)].filter((k) => k.length > 0) });
  }
  if (ingredients.length > PLAN_LIMITS.ingredientsMax) {
    warn("ingredients capped to " + PLAN_LIMITS.ingredientsMax);
    ingredients = ingredients.slice(0, PLAN_LIMITS.ingredientsMax);
    ingEntries = ingEntries.filter((q) => ingredients.some((p) => p.id === q.id));
  }
  if (ingredients.length === 0) errors.push("no usable ingredients");

  // ── D. steps ──
  const stepsRaw: any[] = Array.isArray(raw.steps) ? raw.steps.slice(0, 40) : [];
  const usedStep = newMap();
  let work: WorkStep[] = [];
  for (let i = 0; i < stepsRaw.length; i++) {
    const s = stepsRaw[i];
    if (!isObj(s)) {
      warn("steps[" + i + "] is not an object, dropped");
      continue;
    }
    const label = "step " + (i + 1);
    const action = fixAction(s.action, label, warn);
    const id = uniqueId(snakeId(s.id, action.toLowerCase()), usedStep);
    const title = cleanText(s.title, PLAN_LIMITS.stepTitle, humanize(action), label + " title", warn);
    const whatWhy = cleanText(s.whatWhy, PLAN_LIMITS.whatWhy, title, label + " whatWhy", warn);

    let equipmentId = resolveRef(s.equipmentId, eqEntries, true);
    if (action === "PLATE") {
      if (equipmentId !== plateId) warn(label + " PLATE moved onto the plate '" + plateId + "'");
      equipmentId = plateId;
    } else if (equipmentId === "") {
      const prefs = ACTION_KINDS[action] || ACTION_KINDS.GENERIC;
      let pick = findKind(equipment, prefs);
      if (pick === "" && work.length > 0 && work[work.length - 1].step.equipmentId !== plateId) pick = work[work.length - 1].step.equipmentId;
      if (pick === "") pick = equipment.filter((q) => q.kind !== "PLATE")[0].id;
      warn(label + " '" + id + "' equipmentId '" + String(s.equipmentId) + "' invalid -> " + pick);
      equipmentId = pick;
    }

    let toolId = "";
    if (typeof s.toolId === "string" && s.toolId.trim().length > 0) {
      toolId = resolveRef(s.toolId, toolEntries, true);
      if (toolId === "") warn(label + " toolId '" + s.toolId + "' not defined, cleared");
    }
    if (toolId === "" && action === "ROLL_DOUGH") {
      for (let k = 0; k < tools.length; k++) if (tools[k].kind === "ROLLING_PIN") toolId = tools[k].id;
    }

    const ingredientIds: string[] = [];
    const ingRefs: any[] = Array.isArray(s.ingredientIds) ? s.ingredientIds.slice(0, 16) : [];
    for (let k = 0; k < ingRefs.length; k++) {
      const r = resolveRef(ingRefs[k], ingEntries, true);
      if (r === "") warn(label + " ingredient '" + String(ingRefs[k]) + "' not defined, dropped");
      else if (ingredientIds.indexOf(r) < 0 && ingredientIds.length < 8) ingredientIds.push(r);
    }

    let fromId = resolveRef(s.fromId, eqEntries, true);
    let toId = resolveRef(s.toId, eqEntries, true);
    if (fromId === equipmentId) fromId = "";
    if (toId === equipmentId) toId = "";

    let dur = num(s.durationSec);
    if (isNaN(dur)) dur = DEFAULT_DURATION[action] || 6;
    const durationSec = Math.round(clamp(dur, PLAN_LIMITS.durationMin, PLAN_LIMITS.durationMax) * 10) / 10;
    if (!isNaN(num(s.durationSec)) && durationSec !== num(s.durationSec)) warn(label + " durationSec clamped to " + durationSec);
    let count = num(s.count);
    count = isNaN(count) ? 0 : Math.round(clamp(count, 0, PLAN_LIMITS.countMax));

    let heat = fixHeat(s.heat);
    const eq = eqById[equipmentId];
    if (heat === "OFF" && inList(HEATED_ACTIONS, action) && eq && !inList(NO_BURNER_KINDS, eq.kind)) {
      heat = "MED";
      warn(label + " '" + id + "' " + action + " had no heat -> MED");
    }
    if (heat !== "OFF" && eq && inList(NO_BURNER_KINDS, eq.kind)) {
      warn(label + " '" + id + "' heat on a " + eq.kind + " -> OFF");
      heat = "OFF";
    }

    const afterRaw: any[] = Array.isArray(s.after) ? s.after.slice(0, 16) : typeof s.after === "string" && s.after.trim().length > 0 ? [s.after] : [];
    work.push({
      rawId: typeof s.id === "string" ? s.id : id,
      afterRaw: afterRaw,
      step: {
        id: id, action: action, title: title, whatWhy: whatWhy, equipmentId: equipmentId, toolId: toolId,
        ingredientIds: ingredientIds, fromId: fromId, toId: toId, durationSec: durationSec, heat: heat, count: count, after: [],
      },
    });
  }
  if (work.length > PLAN_LIMITS.stepsMax) {
    warn("steps capped to " + PLAN_LIMITS.stepsMax + " (kept the first " + (PLAN_LIMITS.stepsMax - 1) + " and the last)");
    work = work.slice(0, PLAN_LIMITS.stepsMax - 1).concat([work[work.length - 1]]);
  }

  // helper: the vessel the food most plausibly comes from when plating
  const sourceBefore = (index: number): string => {
    for (let k = index - 1; k >= 0; k--) {
      const q = eqById[work[k].step.equipmentId];
      if (q && q.kind !== "PLATE" && !inList(NO_BURNER_KINDS, q.kind)) return q.id;
    }
    for (let k = index - 1; k >= 0; k--) if (work[k].step.equipmentId !== plateId) return work[k].step.equipmentId;
    return "";
  };

  // ── E. PLATE guarantee ──
  let lastPlate = -1;
  for (let i = 0; i < work.length; i++) if (work[i].step.action === "PLATE") lastPlate = i;
  const lastAction = work.length > 0 ? work[work.length - 1].step.action : "";
  if (lastPlate < 0 || (lastAction !== "PLATE" && lastAction !== "GARNISH")) {
    let at = work.length;
    if (lastPlate < 0) while (at > 0 && work[at - 1].step.action === "GARNISH") at--;
    const prev = at > 0 ? work[at - 1].step : null;
    const pid = uniqueId("plate_dish", usedStep);
    const plateStep: CookStep = {
      id: pid, action: "PLATE", title: "Plate the dish", whatWhy: "Move the finished food onto the serving plate and present it.",
      equipmentId: plateId, toolId: "", ingredientIds: prev ? prev.ingredientIds.slice(0, 8) : [], fromId: "", toId: "",
      durationSec: 6, heat: "OFF", count: 0, after: [],
    };
    work.splice(at, 0, { rawId: pid, afterRaw: [], step: plateStep });
    warn("added a PLATE step '" + pid + "' (final step must plate the dish)");
    lastPlate = at;
  }
  for (let i = 0; i < work.length; i++) {
    const st = work[i].step;
    if (st.action === "PLATE" && st.fromId === "") st.fromId = sourceBefore(i);
    if (st.action === "GARNISH" && i > lastPlate) st.equipmentId = plateId;
    if (st.action === "GARNISH" && eqById[st.equipmentId] === undefined) st.equipmentId = plateId;
  }

  // ── F. `after` DAG ──
  const stepEntries: RefEntry[] = work.map((w) => ({ id: w.step.id, keys: [norm(w.rawId)] }));
  const n = work.length;
  const deps: number[][] = [];
  const explicitBack: number[][] = [];
  const explicitFwd: number[][] = [];
  const idToIdx = newMap();
  for (let i = 0; i < n; i++) idToIdx[work[i].step.id] = i;
  for (let i = 0; i < n; i++) {
    deps.push([]);
    explicitBack.push([]);
    explicitFwd.push([]);
    for (let k = 0; k < work[i].afterRaw.length; k++) {
      const rid = resolveRef(work[i].afterRaw[k], stepEntries, false);
      if (rid === "") {
        warn("step '" + work[i].step.id + "' after '" + String(work[i].afterRaw[k]) + "' not found, dropped");
        continue;
      }
      const j = idToIdx[rid] as number;
      if (j === i) warn("step '" + work[i].step.id + "' waits on itself, dropped");
      else if (j < i) pushUnique(explicitBack[i], j);
      else pushUnique(explicitFwd[i], j);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < explicitBack[i].length; k++) pushUnique(deps[i], explicitBack[i][k]);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < explicitFwd[i].length; k++) {
      const j = explicitFwd[i][k];
      if (reaches(deps, j, i)) warn("step '" + work[i].step.id + "' after '" + work[j].step.id + "' would create a cycle, dropped");
      else pushUnique(deps[i], j);
    }
  }
  for (let i = 1; i < n; i++) if (deps[i].length === 0 && !reaches(deps, i - 1, i)) deps[i].push(i - 1);
  // PLATE is the join of every branch; steps listed after it depend on it
  if (lastPlate >= 0) {
    const ancestors = (): boolean[] => {
      const seen: boolean[] = [];
      const stack: number[] = [lastPlate];
      while (stack.length > 0) {
        const x = stack.pop() as number;
        if (seen[x]) continue;
        seen[x] = true;
        for (let q = 0; q < deps[x].length; q++) stack.push(deps[x][q]);
      }
      return seen;
    };
    for (let k = n - 1; k >= 0; k--) {
      if (k === lastPlate) continue;
      if (k < lastPlate) {
        if (!ancestors()[k] && !reaches(deps, k, lastPlate)) pushUnique(deps[lastPlate], k);
      } else if (!reaches(deps, k, lastPlate) && !reaches(deps, lastPlate, k)) {
        pushUnique(deps[k], lastPlate);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const sorted = deps[i].slice().sort((a, b) => a - b);
    work[i].step.after = sorted.map((j) => work[j].step.id);
  }
  const steps: CookStep[] = work.map((w) => w.step);

  // ── G. garnish + prune what no step uses (the stage loads only what the steps need) ──
  let garnishIds: string[] = [];
  const gRaw: any[] = Array.isArray(raw.garnishIds) ? raw.garnishIds.slice(0, 12) : [];
  for (let i = 0; i < gRaw.length; i++) {
    const r = resolveRef(gRaw[i], ingEntries, true);
    if (r !== "" && garnishIds.indexOf(r) < 0) garnishIds.push(r);
  }
  if (!Array.isArray(raw.garnishIds)) {
    for (let i = 0; i < ingredients.length; i++) if (ingredients[i].role === "GARNISH") garnishIds.push(ingredients[i].id);
  }
  const usedEqIds = newMap();
  const usedToolIds = newMap();
  const usedIngIds = newMap();
  usedEqIds[plateId] = true;
  for (let i = 0; i < steps.length; i++) {
    usedEqIds[steps[i].equipmentId] = true;
    if (steps[i].fromId !== "") usedEqIds[steps[i].fromId] = true;
    if (steps[i].toId !== "") usedEqIds[steps[i].toId] = true;
    if (steps[i].toolId !== "") usedToolIds[steps[i].toolId] = true;
    for (let k = 0; k < steps[i].ingredientIds.length; k++) usedIngIds[steps[i].ingredientIds[k]] = true;
  }
  // a garnish that no step names is still plated by the final garnish/plate step, so it counts as used
  for (let i = 0; i < garnishIds.length; i++) usedIngIds[garnishIds[i]] = true;
  const keepTools = tools.filter((t) => usedToolIds[t.id] === true);
  if (keepTools.length !== tools.length) warn("dropped " + (tools.length - keepTools.length) + " unused tool(s)");
  tools = keepTools;
  const keepIng = ingredients.filter((g) => usedIngIds[g.id] === true);
  if (keepIng.length !== ingredients.length && keepIng.length > 0) {
    warn("dropped " + (ingredients.length - keepIng.length) + " unused ingredient(s)");
    ingredients = keepIng;
  }
  const keepEq = equipment.filter((q) => usedEqIds[q.id] === true);
  if (keepEq.length !== equipment.length && keepEq.filter((q) => q.kind !== "PLATE").length > 0) {
    warn("dropped " + (equipment.length - keepEq.length) + " unused equipment");
    equipment = keepEq;
  }
  garnishIds = garnishIds.filter((g) => ingredients.some((p) => p.id === g));

  // ── H. burners ──
  const heatedEq = newMap();
  for (let i = 0; i < steps.length; i++) if (steps[i].heat !== "OFF" || inList(HEATED_ACTIONS, steps[i].action)) heatedEq[steps[i].equipmentId] = true;
  const taken: boolean[] = [false, false, false, false];
  const needs: CookEquipment[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const q = equipment[i];
    if (inList(NO_BURNER_KINDS, q.kind)) {
      if (q.burner !== 0) warn("'" + q.id + "' (" + q.kind + ") cannot sit on a burner -> 0");
      q.burner = 0;
    } else if (q.burner > 0 && !taken[q.burner]) {
      taken[q.burner] = true;
    } else if (q.burner > 0) {
      needs.push(q);
    } else if (heatedEq[q.id] === true) {
      needs.push(q);
    }
  }
  for (let i = 0; i < needs.length; i++) {
    let free = 0;
    for (let b = 1; b <= PLAN_LIMITS.burnerMax; b++) {
      if (!taken[b]) {
        free = b;
        break;
      }
    }
    if (needs[i].burner > 0) warn("burner " + needs[i].burner + " already used, '" + needs[i].id + "' -> " + (free > 0 ? "burner " + free : "off-burner"));
    else warn("'" + needs[i].id + "' is heated but had no burner -> " + (free > 0 ? "burner " + free : "off-burner"));
    needs[i].burner = free;
    if (free > 0) taken[free] = true;
  }

  const plan: CookPlan = {
    found: true,
    notFoundMessage: "",
    dishTitle: dishTitle.length > 0 ? dishTitle : "Custom dish",
    cuisineTag: cuisineTag,
    equipment: equipment,
    tools: tools,
    ingredients: ingredients,
    steps: steps,
    plateEquipmentId: plateId,
    garnishIds: garnishIds,
  };
  if (dishTitle.length === 0) warn("dishTitle missing -> 'Custom dish'");

  if (steps.length < PLAN_LIMITS.stepsMin) errors.push("too few steps (" + steps.length + ", need " + PLAN_LIMITS.stepsMin + ")");
  if (errors.length === 0) {
    const problems = validateCookPlan(plan);
    for (let i = 0; i < problems.length; i++) errors.push("post-check: " + problems[i]);
  }
  if (errors.length > 0) return fail();
  return { ok: true, plan: plan, errors: errors, warnings: warnings };
}

// ── strict validation (no repair): used as the sanitizer's own post-check and by tests of hand-authored plans ────

/** Returns a list of violated invariants ([] = the plan is valid). A found:false plan is valid when it is empty. */
export function validateCookPlan(p: CookPlan): string[] {
  const bad: string[] = [];
  if (!p || typeof p !== "object") return ["plan missing"];
  if (p.found === false) {
    if (p.steps.length + p.equipment.length + p.tools.length + p.ingredients.length > 0) bad.push("notFound plan carries content");
    return bad;
  }
  const snake = /^[a-z][a-z0-9_]*$/;
  const text = (v: string, max: number, what: string) => {
    if (typeof v !== "string" || v.length === 0 || v.length > max) bad.push(what + " length invalid");
  };
  text(p.dishTitle, PLAN_LIMITS.dishTitle, "dishTitle");
  if (typeof p.cuisineTag !== "string" || p.cuisineTag.length > PLAN_LIMITS.cuisineTag) bad.push("cuisineTag invalid");

  const eqIds = newMap();
  let plates = 0;
  let plateId = "";
  const burners = newMap();
  if (p.equipment.length < 1 || p.equipment.length > PLAN_LIMITS.equipmentMax) bad.push("equipment count " + p.equipment.length);
  for (let i = 0; i < p.equipment.length; i++) {
    const q = p.equipment[i];
    if (!snake.test(q.id) || eqIds[q.id] === true) bad.push("equipment id '" + q.id + "' invalid/duplicate");
    eqIds[q.id] = true;
    if (!inList(EQUIPMENT_KINDS, q.kind)) bad.push("equipment kind '" + q.kind + "'");
    if (q.kind === "PLATE") {
      plates++;
      plateId = q.id;
    }
    if (!(q.burner === Math.round(q.burner) && q.burner >= 0 && q.burner <= PLAN_LIMITS.burnerMax)) bad.push("burner of '" + q.id + "' out of range");
    if (q.burner > 0) {
      if (burners[q.burner] === true) bad.push("burner " + q.burner + " shared");
      burners[q.burner] = true;
    }
  }
  if (plates !== 1) bad.push("expected exactly one PLATE, found " + plates);
  if (p.plateEquipmentId !== plateId) bad.push("plateEquipmentId is not the PLATE");

  const toolIds = newMap();
  if (p.tools.length > PLAN_LIMITS.toolsMax) bad.push("tools count " + p.tools.length);
  for (let i = 0; i < p.tools.length; i++) {
    const t = p.tools[i];
    if (!snake.test(t.id) || toolIds[t.id] === true) bad.push("tool id '" + t.id + "' invalid/duplicate");
    toolIds[t.id] = true;
    if (!inList(TOOL_KINDS, t.kind)) bad.push("tool kind '" + t.kind + "'");
  }

  const ingIds = newMap();
  if (p.ingredients.length < 1 || p.ingredients.length > PLAN_LIMITS.ingredientsMax) bad.push("ingredient count " + p.ingredients.length);
  for (let i = 0; i < p.ingredients.length; i++) {
    const g = p.ingredients[i];
    if (!snake.test(g.id) || ingIds[g.id] === true) bad.push("ingredient id '" + g.id + "' invalid/duplicate");
    ingIds[g.id] = true;
    if (!inList(INGREDIENT_ROLES, g.role)) bad.push("ingredient role '" + g.role + "'");
    if (g.name.length === 0 || g.name.length > PLAN_LIMITS.ingredientName) bad.push("ingredient name '" + g.name + "'");
    for (let c = 0; c < 2; c++) {
      const col = c === 0 ? g.colorRaw : g.colorDone;
      if (!Array.isArray(col) || col.length !== 3) {
        bad.push("colour of '" + g.id + "' not 3 numbers");
        continue;
      }
      for (let k = 0; k < 3; k++) if (typeof col[k] !== "number" || !isFinite(col[k]) || col[k] < 0 || col[k] > 1) bad.push("colour of '" + g.id + "' out of 0..1");
      if (col[0] + col[1] + col[2] < PLAN_LIMITS.minColorSum) bad.push("colour of '" + g.id + "' too dark");
    }
  }

  const stepIdx = newMap();
  if (p.steps.length < PLAN_LIMITS.stepsMin || p.steps.length > PLAN_LIMITS.stepsMax) bad.push("step count " + p.steps.length);
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i];
    if (!snake.test(s.id) || stepIdx[s.id] !== undefined) bad.push("step id '" + s.id + "' invalid/duplicate");
    stepIdx[s.id] = i;
  }
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i];
    const w = "step '" + s.id + "'";
    if (s.action !== "GENERIC" && !inList(COOK_ACTIONS, s.action)) bad.push(w + " action '" + s.action + "'");
    text(s.title, PLAN_LIMITS.stepTitle, w + " title");
    text(s.whatWhy, PLAN_LIMITS.whatWhy, w + " whatWhy");
    if (eqIds[s.equipmentId] !== true) bad.push(w + " equipmentId '" + s.equipmentId + "' undefined");
    if (s.toolId !== "" && toolIds[s.toolId] !== true) bad.push(w + " toolId '" + s.toolId + "' undefined");
    for (let k = 0; k < s.ingredientIds.length; k++) if (ingIds[s.ingredientIds[k]] !== true) bad.push(w + " ingredient '" + s.ingredientIds[k] + "' undefined");
    if (s.fromId !== "" && eqIds[s.fromId] !== true) bad.push(w + " fromId undefined");
    if (s.toId !== "" && eqIds[s.toId] !== true) bad.push(w + " toId undefined");
    if (!(s.durationSec >= PLAN_LIMITS.durationMin && s.durationSec <= PLAN_LIMITS.durationMax)) bad.push(w + " durationSec out of range");
    if (!(s.count === Math.round(s.count) && s.count >= 0 && s.count <= PLAN_LIMITS.countMax)) bad.push(w + " count out of range");
    if (!inList(HEAT_LEVELS, s.heat)) bad.push(w + " heat '" + s.heat + "'");
    for (let k = 0; k < s.after.length; k++) {
      if (stepIdx[s.after[k]] === undefined) bad.push(w + " after '" + s.after[k] + "' undefined");
      else if (s.after[k] === s.id) bad.push(w + " waits on itself");
    }
    if (s.action === "PLATE" && s.equipmentId !== plateId) bad.push(w + " PLATE not on the plate");
  }
  // acyclic (iterative three-colour DFS)
  if (bad.length === 0) {
    const state: number[] = p.steps.map(() => 0);
    for (let root = 0; root < p.steps.length; root++) {
      if (state[root] !== 0) continue;
      const stack: number[][] = [[root, 0]];
      state[root] = 1;
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const s = p.steps[top[0]];
        if (top[1] < s.after.length) {
          const j = stepIdx[s.after[top[1]]] as number;
          top[1]++;
          if (state[j] === 1) {
            bad.push("cycle through '" + p.steps[j].id + "'");
            return bad;
          }
          if (state[j] === 0) {
            state[j] = 1;
            stack.push([j, 0]);
          }
        } else {
          state[top[0]] = 2;
          stack.pop();
        }
      }
    }
    let plateAt = -1;
    for (let i = 0; i < p.steps.length; i++) if (p.steps[i].action === "PLATE") plateAt = i;
    if (plateAt < 0) bad.push("no PLATE step");
    const last = p.steps[p.steps.length - 1];
    if (last.action !== "PLATE" && !(last.action === "GARNISH" && plateAt >= 0)) bad.push("last step is not PLATE (or GARNISH after PLATE)");
  }
  for (let i = 0; i < p.garnishIds.length; i++) if (ingIds[p.garnishIds[i]] !== true) bad.push("garnish '" + p.garnishIds[i] + "' undefined");
  return bad;
}
