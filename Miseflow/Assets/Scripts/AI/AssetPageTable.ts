/**
 * AssetPageTable.ts  (v5 Part 2 + D1 master catalogue, implementation_plan WS13 / idea v5 sections 3.1 + 3.2)
 * OS-style page tables for spatial cooking:
 *   IngredientPageTable    #101-#109 + #122-#130 vegetables, #116-#121 starches, #160-#166 spices/dairy/oils/legumes,
 *                          #140-#149 proteins, #200+ dynamic page-fault cache
 *   VesselToolPageTable    #301-#343 vessels / tools / service ware (params only, no meshes)
 *   AssetPageTable.batchLoad(blueprint)  runs Loader A (ingredients) and Loader B (vessels + accessories) in parallel.
 *
 * ALIAS TABLE (old number -> canonical number). Old numbers keep resolving; the canonical number is what comes back.
 *   proteins   #110 salmon        -> #140      #111 ribeye       -> #141      #112 paneer steak -> #146
 *              #113 tofu slab     -> #147      #114 scallops     -> #144      #115 cubed mushroom/paneer/chicken -> #142
 *   vessels    #311 saucier       -> #304
 *   NO alias possible (number re-assigned by the master catalogue; presets migrated instead):
 *              #323 old prep bowl is now the vegetable cleaver -> prep bowl is #325.
 *   unchanged  #101-#109, #301, #302, #303 (handi), #321 (santoku), #331, #332, #341.
 *
 * Page fault = an access number that is not in the table. It is resolved by synthesizeMissingIngredient():
 *   1. offline, deterministic parametric archetype fallback (always available), and
 *   2. optionally the Anthropic Messages API, ONLY when AiModelConfig.isLiveEnabled("synthesizer")
 *      (model id AND key set) and the runtime hook below is installed. Never throws, falls back to (1).
 * The result is cached at #200+ so the second request for the same address is a hit.
 * No meshes are built here: this module is data only (meshes are the asset phase, see IDishAssetBuilder).
 */

import { getApiKey, getModel, isLiveEnabled } from "./AiModelConfig";
import { SlotId } from "./SpatialSlotAllocator";
import {
  PREP_ARCHETYPE_LIST,
  PrepArchetype,
  PrepSlotEntry,
  PrimaryKinematicType,
  ProteinArchetype,
  Rgb,
  UniversalDishBlueprint,
} from "./UniversalDishSchema";

const ENDPOINT_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const SYNTH_TIMEOUT_MS = 15000; // live synth measured ~8-10 s
const SYNTH_MAX_TOKENS = 400;

export const DYNAMIC_INGREDIENT_FIRST = 200;
export const DYNAMIC_INGREDIENT_LAST = 249;
export const DYNAMIC_PROTEIN_FIRST = 250;
export const DYNAMIC_PROTEIN_LAST = 299;

// ───────────────────────────── alias tables ─────────────────────────────

/** Old protein numbers -> canonical #140-#149. */
export const PROTEIN_ALIASES: { [old: number]: number } = { 110: 140, 111: 141, 112: 146, 113: 147, 114: 144, 115: 142 };
/** Old vessel/tool numbers -> canonical #301-#355. */
export const VESSEL_ALIASES: { [old: number]: number } = { 311: 304 };
/** Old ingredient numbers -> canonical (none today: #101-#109 are unchanged). */
export const INGREDIENT_ALIASES: { [old: number]: number } = {};

export function canonicalProteinNumber(n: number): number {
  const a = PROTEIN_ALIASES[n];
  return a !== undefined ? a : n;
}
export function canonicalVesselNumber(n: number): number {
  const a = VESSEL_ALIASES[n];
  return a !== undefined ? a : n;
}
export function canonicalIngredientNumber(n: number): number {
  const a = INGREDIENT_ALIASES[n];
  return a !== undefined ? a : n;
}

// ───────────────────────────── runtime hook (HTTP + timers) ─────────────────────────────

/** Installed by a component (RecipeCompilerService) because plain modules cannot create script events. */
export interface PageTableRuntime {
  internetModule: any;
  /** Calls cb once after `seconds` (DelayedCallbackEvent). */
  delay: (seconds: number, cb: () => void) => void;
}
let runtime: PageTableRuntime | null = null;

// ───────────────────────────── helpers ─────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function validRgb(c: any): c is Rgb {
  return Array.isArray(c) && c.length === 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

function cloneRgb(c: Rgb): Rgb {
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
}

function cloneEntry(e: PrepSlotEntry): PrepSlotEntry {
  const o: PrepSlotEntry = {
    accessNumber: e.accessNumber,
    name: e.name,
    archetype: e.archetype,
    colorRgb: [e.colorRgb[0], e.colorRgb[1], e.colorRgb[2]],
    scaleMultiplier: e.scaleMultiplier,
  };
  if (e.stemColorRgb) o.stemColorRgb = [e.stemColorRgb[0], e.stemColorRgb[1], e.stemColorRgb[2]];
  return o;
}

function isPrepArchetype(a: any): a is PrepArchetype {
  return PREP_ARCHETYPE_LIST.indexOf(a) >= 0;
}

/** Archetype defaults used by the parametric fallback (deterministic). */
const ARCH_DEFAULT: { [a: string]: { color: Rgb; stem?: Rgb; scale: number } } = {
  BULB_ALLIUM: { color: [0.66, 0.30, 0.50], scale: 1.0 },
  CYLINDER_STALK: { color: [0.30, 0.60, 0.22], stem: [0.30, 0.50, 0.15], scale: 1.0 },
  SPHERE_CROWN: { color: [0.80, 0.30, 0.18], stem: [0.20, 0.45, 0.15], scale: 0.95 },
  LEAFY_HERB: { color: [0.16, 0.50, 0.14], stem: [0.30, 0.55, 0.20], scale: 1.0 },
  CUBED_BLOCK: { color: [0.94, 0.86, 0.62], scale: 0.95 },
  GRANULAR: { color: [0.96, 0.80, 0.20], scale: 0.9 },
  GRANULAR_MOUND: { color: [0.95, 0.90, 0.75], scale: 1.0 },
  STRAND_TANGLE: { color: [0.95, 0.85, 0.55], scale: 1.0 },
  TUBE_ARRAY: { color: [0.95, 0.83, 0.52], scale: 1.0 },
  DISC_SHEET: { color: [0.96, 0.90, 0.76], scale: 1.0 },
  SPICE_CLUSTER: { color: [0.43, 0.24, 0.12], scale: 0.8 },
  LIQUID_SWIRL: { color: [0.98, 0.94, 0.86], scale: 0.9 },
};

function guessArchetype(name: string): PrepArchetype {
  const n = (name || "").toLowerCase();
  if (/(noodle|ramen|udon|spaghetti|vermicelli|linguine|fettuccine|tagliatelle)/.test(n)) return "STRAND_TANGLE";
  if (/(penne|rigatoni|macaroni|fusilli|tube)/.test(n)) return "TUBE_ARRAY";
  if (/(dough|flatbread|roti|naan|tortilla|pizza|crepe)/.test(n)) return "DISC_SHEET";
  if (/(rice|grain|lentil|dal\b|chickpea|quinoa|couscous|powder|ground spice|cheese)/.test(n)) return "GRANULAR_MOUND";
  if (/(cream|yogurt|yoghurt|oil|glaze|coconut milk|saffron milk)/.test(n)) return "LIQUID_SWIRL";
  if (/(star anise|cinnamon|cardamom|clove|bay leaf|whole spice|masala trio)/.test(n)) return "SPICE_CLUSTER";
  if (/(paneer|tofu|ginger|block|cube|turmeric|yam|squash|bread|brioche|butter|ghee)/.test(n)) return "CUBED_BLOCK";
  if (/(herb|leaf|leaves|mint|basil|cilantro|coriander|parsley|thyme|shiso|spinach|kale|chive|dill|methi|cabbage|bok choy)/.test(n)) return "LEAFY_HERB";
  if (/(mushroom|tomato|apple|pepper|cap|pear|peach|plum|radish|beet|turnip|potato|lemon|lime|avocado|mango|broccoli|cauliflower)/.test(n)) return "SPHERE_CROWN";
  if (/(onion|shallot|garlic|leek|bulb|fennel|eggplant|aubergine)/.test(n)) return "BULB_ALLIUM";
  return "CYLINDER_STALK";
}

/** Pure, offline, deterministic: same entry in -> same entry out. Keeps the requested accessNumber for the caller to remap. */
export function parametricIngredient(entry: PrepSlotEntry): PrepSlotEntry {
  const arch: PrepArchetype = isPrepArchetype(entry.archetype) ? entry.archetype : guessArchetype(entry.name);
  const d = ARCH_DEFAULT[arch];
  const color: Rgb = validRgb(entry.colorRgb) ? cloneRgb(entry.colorRgb) : [d.color[0], d.color[1], d.color[2]];
  let stem: Rgb | undefined;
  if (validRgb(entry.stemColorRgb)) stem = cloneRgb(entry.stemColorRgb);
  else if (d.stem) stem = [d.stem[0], d.stem[1], d.stem[2]];
  else stem = undefined;
  let scale = isFinite(entry.scaleMultiplier) && entry.scaleMultiplier > 0 ? entry.scaleMultiplier : d.scale;
  scale = Math.max(0.5, Math.min(1.2, scale));
  const out: PrepSlotEntry = {
    accessNumber: entry.accessNumber,
    name: entry.name && entry.name.length > 0 ? entry.name : "Ingredient #" + entry.accessNumber,
    archetype: arch,
    colorRgb: color,
    scaleMultiplier: scale,
  };
  if (stem) out.stemColorRgb = stem;
  return out;
}

// ───────────────────────────── Table 1: ingredients ─────────────────────────────

export type IngredientGroup = "VEG" | "STARCH" | "SPICE";

/** A pre-registered catalogue ingredient: a PrepSlotEntry plus group, stage notes and optional extra palette colours. */
export interface IngredientCatalogEntry extends PrepSlotEntry {
  group: IngredientGroup;
  /** Short note of the 3 build stages (veg: Whole/Partial/Cut pile; starch: Raw/Par-cooked/Finished). */
  stageNotes: string;
  /** Additional palette colours (e.g. the 4 ground-spice powders, the 4 oils & glazes). */
  extraColors?: Rgb[];
}

export interface ProteinPageEntry {
  accessNumber: number;
  name: string;
  archetype: ProteinArchetype;
  primaryKine: PrimaryKinematicType;
  rawTopRgb: Rgb;
  searedCrustRgb: Rgb;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Short note about the dual surface (raw top + seared crust). */
  stageNotes: string;
}

function protein(n: number, name: string, a: ProteinArchetype, kine: PrimaryKinematicType, raw: Rgb, seared: Rgb, l: number, w: number, h: number, notes: string = ""): ProteinPageEntry {
  return { accessNumber: n, name: name, archetype: a, primaryKine: kine, rawTopRgb: raw, searedCrustRgb: seared, lengthCm: l, widthCm: w, heightCm: h, stageNotes: notes };
}

function cat(
  n: number, group: IngredientGroup, name: string, a: PrepArchetype, c: Rgb, stage: string,
  stem?: Rgb, scale: number = 1.0, extra?: Rgb[]
): IngredientCatalogEntry {
  const e: IngredientCatalogEntry = { accessNumber: n, name: name, archetype: a, colorRgb: c, scaleMultiplier: scale, group: group, stageNotes: stage };
  if (stem) e.stemColorRgb = stem;
  if (extra) e.extraColors = extra;
  return e;
}

const VEG_STAGES = "Whole -> Partial -> Cut pile";
const STARCH_STAGES = "Raw -> Par-cooked -> Finished";

/** Pre-registered ingredient catalogue: #101-#109, #122-#130 (veg), #116-#121 (starch), #160-#166 (spice/dairy/oil/legume). */
export const PREP_REGISTRY: IngredientCatalogEntry[] = [
  // ── vegetables / greens / aromatics ──
  cat(101, "VEG", "Red Onion", "BULB_ALLIUM", [0.66, 0.30, 0.50], VEG_STAGES + " (red onion / shallot)"),
  cat(102, "VEG", "Garlic Bulb", "BULB_ALLIUM", [0.96, 0.92, 0.78], VEG_STAGES + " (8-lobed bulb -> cloves -> minced pile)"),
  cat(103, "VEG", "Fresh Herb Bunch", "LEAFY_HERB", [0.16, 0.50, 0.14], VEG_STAGES + " (bunch -> picked leaves -> chiffonade pile)", [0.30, 0.55, 0.20]),
  cat(104, "VEG", "Roma Tomato", "SPHERE_CROWN", [0.90, 0.13, 0.07], VEG_STAGES + " (whole + crown -> halves -> diced pile)", [0.20, 0.45, 0.15]),
  cat(105, "VEG", "Chilli Pepper", "CYLINDER_STALK", [1.0, 0.80, 0.08], VEG_STAGES + " (whole + stalk -> split -> rings pile)", [0.30, 0.50, 0.15]),
  cat(106, "VEG", "Cucumber / Zucchini", "CYLINDER_STALK", [0.18, 0.52, 0.22], VEG_STAGES + " (log -> half-moons -> dice pile)"),
  cat(107, "VEG", "Carrot / Asparagus Spear", "CYLINDER_STALK", [0.95, 0.45, 0.12], VEG_STAGES + " (whole -> batons -> brunoise pile)", [0.30, 0.50, 0.15]),
  cat(108, "VEG", "Cremini / Button Mushroom", "SPHERE_CROWN", [0.76, 0.68, 0.58], VEG_STAGES + " (cap + stem -> halves -> sliced pile)"),
  cat(109, "VEG", "Ginger Root / Paneer Block", "CUBED_BLOCK", [0.94, 0.86, 0.62], VEG_STAGES + " (root block -> planks -> matchstick pile)"),
  cat(122, "VEG", "Bell Pepper", "SPHERE_CROWN", [0.86, 0.16, 0.10], VEG_STAGES + " (4-lobed pepper -> quarters -> strip pile)", [0.25, 0.50, 0.18]),
  cat(123, "VEG", "Broccoli / Cauliflower", "SPHERE_CROWN", [0.20, 0.50, 0.18], VEG_STAGES + " (head -> florets -> small floret pile)", [0.45, 0.65, 0.30]),
  cat(124, "VEG", "Bok Choy / Cabbage / Spinach", "LEAFY_HERB", [0.30, 0.58, 0.22], VEG_STAGES + " (head -> leaves -> shredded pile)", [0.75, 0.85, 0.55]),
  cat(125, "VEG", "Eggplant", "BULB_ALLIUM", [0.38, 0.16, 0.42], VEG_STAGES + " (elongated whole -> halves -> cubed pile)", [0.25, 0.50, 0.20]),
  cat(126, "VEG", "Scallion", "CYLINDER_STALK", [0.40, 0.68, 0.25], VEG_STAGES + " (bunch -> trimmed -> bias-sliced pile)", [0.92, 0.95, 0.80]),
  cat(127, "VEG", "Sweet Corn / Peas", "CYLINDER_STALK", [0.98, 0.82, 0.15], VEG_STAGES + " (cob / pod -> half cob -> granular kernel pile)"),
  cat(128, "VEG", "Lemon / Lime", "SPHERE_CROWN", [0.98, 0.85, 0.20], VEG_STAGES + " (whole -> halves -> wedge pile)", [0.30, 0.55, 0.18]),
  cat(129, "VEG", "Avocado / Mango", "SPHERE_CROWN", [0.55, 0.65, 0.22], VEG_STAGES + " (whole -> halved + stone -> cubed pile)"),
  cat(130, "VEG", "Beetroot / Radish", "BULB_ALLIUM", [0.62, 0.10, 0.28], VEG_STAGES + " (root + leaves -> halves -> slice pile)", [0.30, 0.55, 0.20]),
  // ── starches ──
  cat(116, "STARCH", "Basmati / Jasmine Rice", "GRANULAR_MOUND", [0.97, 0.95, 0.86], STARCH_STAGES + " (dry grain mound -> 70% par-cooked -> dum-layered)"),
  cat(117, "STARCH", "Ramen / Hakka / Udon", "STRAND_TANGLE", [0.95, 0.86, 0.58], STARCH_STAGES + " (nest -> loosened strands -> wok-tossed tangle)"),
  cat(118, "STARCH", "Italian Pasta", "STRAND_TANGLE", [0.96, 0.84, 0.52], STARCH_STAGES + " (spaghetti nest or penne array -> al dente -> sauced)"),
  cat(119, "STARCH", "Potato", "SPHERE_CROWN", [0.85, 0.70, 0.42], STARCH_STAGES + " (whole -> parboiled wedges -> crisp cubes)"),
  cat(120, "STARCH", "Dough / Flatbread", "DISC_SHEET", [0.96, 0.90, 0.76], STARCH_STAGES + " (dough ball -> rolled disc -> blistered flatbread)"),
  cat(121, "STARCH", "Bread / Brioche", "CUBED_BLOCK", [0.90, 0.68, 0.36], STARCH_STAGES + " (loaf -> cubes -> golden croutons)"),
  // ── spices / dairy / oils / legumes ──
  cat(160, "SPICE", "Whole Garam Masala Trio", "SPICE_CLUSTER", [0.43, 0.24, 0.12], "Whole -> Toasted -> Bloomed (star anise, cinnamon quill, cardamom, cloves, bay)", [0.30, 0.38, 0.18]),
  cat(161, "SPICE", "Ground Spice Powders", "GRANULAR_MOUND", [0.96, 0.72, 0.0], "Pinch -> Bloomed in fat -> Folded in (turmeric, kashmiri red, cumin/garam, herb green)", undefined, 0.8,
    [[0.96, 0.72, 0.0], [0.79, 0.10, 0.07], [0.43, 0.28, 0.13], [0.23, 0.48, 0.16]]),
  cat(162, "SPICE", "Butter / Ghee Pat", "CUBED_BLOCK", [0.99, 0.90, 0.52], "Cold pat -> Melting -> Pooled"),
  cat(163, "SPICE", "Grated Cheese", "GRANULAR_MOUND", [0.98, 0.85, 0.45], "Wedge -> Grated pile -> Melted finish"),
  cat(164, "SPICE", "Cream / Coconut / Yogurt", "LIQUID_SWIRL", [0.99, 0.97, 0.92], "Pooled -> Swirled -> Folded in"),
  cat(165, "SPICE", "Oils & Umami Glazes", "LIQUID_SWIRL", [0.80, 0.55, 0.12], "Drizzle -> Sheen -> Glazed (olive, sesame, dark soy/teriyaki, saffron milk)", undefined, 0.9,
    [[0.80, 0.55, 0.12], [0.72, 0.45, 0.10], [0.32, 0.16, 0.08], [0.98, 0.70, 0.12]]),
  cat(166, "SPICE", "Lentils / Dal / Chickpeas", "GRANULAR_MOUND", [0.85, 0.62, 0.22], "Dry -> Soaked -> Simmered"),
];

/** Pre-registered proteins #140-#149 (dual surface: raw top + seared crust). Old #110-#115 resolve through PROTEIN_ALIASES. */
export const PROTEIN_REGISTRY: ProteinPageEntry[] = [
  protein(140, "Atlantic Salmon Fillet", "FILLET_SLAB", "KINE_SPATULA_FLIP_180", [1.0, 0.42, 0.32], [0.85, 0.51, 0.17], 9.0, 4.5, 1.9, "raw #FF6B52 -> seared #D9822B"),
  protein(141, "Prime Ribeye Steak", "MARBLED_STEAK", "KINE_SPATULA_FLIP_180", [0.65, 0.14, 0.14], [0.29, 0.13, 0.06], 10.0, 7.0, 3.0, "raw #A62424 -> seared #4A2210"),
  protein(142, "Chicken Tikka / Marinated Pieces", "CUBED_SEAR", "KINE_PAN_TOSS_ROLL", [0.93, 0.72, 0.55], [0.62, 0.33, 0.14], 7.0, 5.0, 2.0, "slab or cubes; also mushroom / paneer cubes"),
  protein(143, "Tiger Prawns", "MEDALLION_SCALLOP", "KINE_PAN_TOSS_ROLL", [0.96, 0.60, 0.48], [0.90, 0.35, 0.20], 6.5, 5.0, 2.2, "C-curve; raw translucent -> opaque coral"),
  protein(144, "Diver Scallops", "MEDALLION_SCALLOP", "KINE_SPATULA_FLIP_180", [1.0, 0.97, 0.93], [0.83, 0.53, 0.16], 6.0, 6.0, 2.2, "raw #FFF8EE -> seared #D4882A"),
  protein(145, "Eggs", "DISC_SHEET", "KINE_SPATULA_FLIP_180", [1.0, 0.97, 0.85], [0.85, 0.65, 0.25], 6.0, 6.0, 1.2, "fried disc (or sphere-crown yolk)"),
  protein(146, "Paneer", "FILLET_SLAB", "KINE_SPATULA_FLIP_180", [0.97, 0.89, 0.59], [0.79, 0.36, 0.12], 8.0, 5.0, 2.2, "slab or cubes; raw #F7E396 -> seared #C95B1E"),
  protein(147, "Firm Tofu", "FILLET_SLAB", "KINE_SPATULA_FLIP_180", [0.98, 0.95, 0.89], [0.62, 0.28, 0.09], 7.0, 4.5, 2.0, "raw #FAF3E3 -> seared #9E4716"),
  protein(148, "Kofta / Meatballs", "CUBED_SEAR", "KINE_PAN_TOSS_ROLL", [0.78, 0.45, 0.32], [0.42, 0.20, 0.09], 6.0, 5.0, 2.8, "spheres; roll in the pan"),
  protein(149, "Bacon / Pancetta", "CUBED_SEAR", "KINE_PAN_TOSS_ROLL", [0.90, 0.50, 0.46], [0.55, 0.25, 0.12], 6.5, 4.5, 1.2, "lardons; render then toss"),
];

/** Extra per-name look-up for presets / tests. */
export function getCatalogEntry(accessNumber: number): IngredientCatalogEntry | null {
  const n = canonicalIngredientNumber(accessNumber);
  for (let i = 0; i < PREP_REGISTRY.length; i++) if (PREP_REGISTRY[i].accessNumber === n) return PREP_REGISTRY[i];
  return null;
}

export interface IngredientBatchResult {
  resolved: PrepSlotEntry[];
  hits: number;
  faults: number;
}

export class IngredientPageTable {
  private prepTable: { [n: number]: IngredientCatalogEntry } = {};
  private proteinTable: { [n: number]: ProteinPageEntry } = {};
  private dynamicIngredients: { [n: number]: PrepSlotEntry } = {};
  private dynamicProteins: { [n: number]: ProteinPageEntry } = {};
  /** requested access number -> assigned dynamic address, for faults that did not ask for a free #200+ slot */
  private alias: { [n: number]: number } = {};
  private pending: { [n: number]: Promise<PrepSlotEntry> | undefined } = {};
  /** Next free dynamic ingredient address (#200+). */
  public nextDynamicAddress: number = DYNAMIC_INGREDIENT_FIRST;
  public nextProteinDynamicAddress: number = DYNAMIC_PROTEIN_FIRST;
  public lifetimeHits: number = 0;
  public lifetimeFaults: number = 0;

  constructor() {
    for (let i = 0; i < PREP_REGISTRY.length; i++) this.prepTable[PREP_REGISTRY[i].accessNumber] = PREP_REGISTRY[i];
    for (let i = 0; i < PROTEIN_REGISTRY.length; i++) this.proteinTable[PROTEIN_REGISTRY[i].accessNumber] = PROTEIN_REGISTRY[i];
  }

  /** Drops the dynamic cache and counters (pre-registered entries stay). Used by self-checks. */
  public reset(): void {
    this.dynamicIngredients = {};
    this.dynamicProteins = {};
    this.alias = {};
    this.pending = {};
    this.nextDynamicAddress = DYNAMIC_INGREDIENT_FIRST;
    this.nextProteinDynamicAddress = DYNAMIC_PROTEIN_FIRST;
    this.lifetimeHits = 0;
    this.lifetimeFaults = 0;
  }

  public has(accessNumber: number): boolean {
    return this.lookupIngredient(accessNumber) !== null;
  }

  /** True when the number (or one of its aliases) is a registered/cached protein. */
  public hasProtein(accessNumber: number): boolean {
    const n = canonicalProteinNumber(accessNumber);
    return !!(this.proteinTable[n] || this.dynamicProteins[n]);
  }

  public dynamicCount(): number {
    return Object.keys(this.dynamicIngredients).length + Object.keys(this.dynamicProteins).length;
  }

  private lookupIngredient(num: number): PrepSlotEntry | null {
    const n = canonicalIngredientNumber(num);
    if (this.prepTable[n]) return this.prepTable[n];
    if (this.dynamicIngredients[n]) return this.dynamicIngredients[n];
    const a = this.alias[n];
    if (a !== undefined && this.dynamicIngredients[a]) return this.dynamicIngredients[a];
    return null;
  }

  /** Blueprint values win over table defaults (a dish may rename/recolour #101 as "Shallot"). */
  private mergeHit(reg: PrepSlotEntry, e: PrepSlotEntry): PrepSlotEntry {
    const out: PrepSlotEntry = {
      accessNumber: reg.accessNumber,
      name: e.name && e.name.length > 0 ? e.name : reg.name,
      archetype: isPrepArchetype(e.archetype) ? e.archetype : reg.archetype,
      colorRgb: validRgb(e.colorRgb) ? cloneRgb(e.colorRgb) : cloneRgb(reg.colorRgb),
      scaleMultiplier: isFinite(e.scaleMultiplier) && e.scaleMultiplier > 0 ? e.scaleMultiplier : reg.scaleMultiplier,
    };
    const stem = validRgb(e.stemColorRgb) ? e.stemColorRgb : reg.stemColorRgb;
    if (stem) out.stemColorRgb = cloneRgb(stem);
    return out;
  }

  private allocateIngredientAddress(requested: number): number {
    let addr = requested;
    const wanted = requested >= DYNAMIC_INGREDIENT_FIRST && requested <= DYNAMIC_INGREDIENT_LAST;
    if (!wanted || this.dynamicIngredients[addr] || this.pending[addr]) {
      addr = this.nextDynamicAddress;
      while (this.dynamicIngredients[addr] || this.pending[addr]) addr++;
    }
    if (addr >= this.nextDynamicAddress) this.nextDynamicAddress = addr + 1;
    return addr;
  }

  /**
   * Resolves a batch concurrently with Promise.all. Registered/cached access numbers are hits (synchronous map lookup);
   * unknown ones are page faults -> synthesizeMissingIngredient() -> cached at #200+.
   * Duplicate in-flight requests for the same missing address count as one fault.
   */
  public resolveIngredientBatch(entries: PrepSlotEntry[]): Promise<IngredientBatchResult> {
    let hits = 0;
    let faults = 0;
    const tasks: Promise<PrepSlotEntry>[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const reg = this.lookupIngredient(e.accessNumber);
      if (reg) {
        hits++;
        tasks.push(Promise.resolve(this.mergeHit(reg, e)));
        continue;
      }
      const inflight = this.pending[e.accessNumber];
      if (inflight) {
        hits++;
        tasks.push(inflight.then((r) => this.mergeHit(r, e)));
        continue;
      }
      faults++;
      tasks.push(this.pageFault(e));
    }
    this.lifetimeHits += hits;
    this.lifetimeFaults += faults;
    return Promise.all(tasks).then((resolved) => ({ resolved: resolved, hits: hits, faults: faults }));
  }

  private pageFault(e: PrepSlotEntry): Promise<PrepSlotEntry> {
    const requested = e.accessNumber;
    const addr = this.allocateIngredientAddress(requested);
    const p = this.synthesizeMissingIngredient(e).then((synth) => {
      const stored = cloneEntry(synth);
      stored.accessNumber = addr;
      this.dynamicIngredients[addr] = stored;
      if (requested !== addr) this.alias[requested] = addr;
      delete this.pending[requested];
      delete this.pending[addr];
      print(`[AssetPageTable] page fault #${requested} -> synthesized "${stored.name}" cached at #${addr}`);
      return cloneEntry(stored);
    });
    this.pending[requested] = p;
    this.pending[addr] = p;
    return p;
  }

  /**
   * Page-fault handler. Always returns a usable entry: the parametric archetype fallback, optionally refined by an
   * Anthropic call when AiModelConfig.isLiveEnabled("synthesizer"). Never rejects.
   */
  public synthesizeMissingIngredient(entry: PrepSlotEntry): Promise<PrepSlotEntry> {
    let base: PrepSlotEntry;
    try {
      base = parametricIngredient(entry);
    } catch (_e) {
      base = parametricIngredient({ accessNumber: entry.accessNumber, name: "", archetype: "CYLINDER_STALK", colorRgb: [0.5, 0.5, 0.5], scaleMultiplier: 1.0 });
    }
    if (!isLiveEnabled("synthesizer") || !runtime || !runtime.internetModule) return Promise.resolve(base);
    return this.callSynthesizer(entry, base).then(
      (live) => (live ? live : base),
      (err) => {
        print(`[AssetPageTable] synthesizer failed (${err}) -> parametric fallback`);
        return base;
      }
    );
  }

  /** Thin guarded Anthropic Messages API call (structured output, 2500 ms timeout). Rejects on any failure; caller falls back. */
  private async callSynthesizer(entry: PrepSlotEntry, base: PrepSlotEntry): Promise<PrepSlotEntry | null> {
    const rt = runtime;
    if (!rt) return null;
    const rgbSchema = { type: "array", items: { type: "number" } };
    const schema: any = {
      type: "object",
      properties: {
        name: { type: "string" },
        archetype: { type: "string", enum: PREP_ARCHETYPE_LIST },
        colorRgb: rgbSchema,
        stemColorRgb: rgbSchema,
        scaleMultiplier: { type: "number" },
      },
      required: ["name", "archetype", "colorRgb", "stemColorRgb", "scaleMultiplier"],
      additionalProperties: false,
    };
    const body = {
      model: getModel("synthesizer"),
      max_tokens: SYNTH_MAX_TOKENS,
      system:
        "You parameterise one cooking ingredient for a procedural AR mesh generator. Pick the closest archetype " +
        "(" + PREP_ARCHETYPE_LIST.join(", ") + "), a linear RGB colour (0-1 each) for the raw " +
        "ingredient, a stem/leaf colour (0-1 each, reuse the colour if none), and a scaleMultiplier between 0.6 and 1.2. Reply with the JSON object only.",
      messages: [{ role: "user", content: [{ type: "text", text: "Ingredient: " + (entry.name || "unknown") + " (hint archetype " + base.archetype + ")" }] }],
      output_config: { format: { type: "json_schema", schema: schema } },
    };
    const timeout = new Promise<never>((_res, rej) => {
      rt.delay(SYNTH_TIMEOUT_MS / 1000, () => rej(new Error("timeout " + SYNTH_TIMEOUT_MS + "ms")));
    });
    const response = await Promise.race([
      rt.internetModule.fetch(ENDPOINT_URL, {
        method: "POST",
        headers: { "x-api-key": getApiKey(), "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      timeout,
    ]);
    if (!response || response.status !== 200) throw new Error("HTTP " + (response ? response.status : "none"));
    const data = await response.json();
    if (!data || data.stop_reason === "refusal" || data.stop_reason === "max_tokens") throw new Error("stop_reason " + (data ? data.stop_reason : "none"));
    let text = "";
    const blocks = data.content || [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === "text" && typeof blocks[i].text === "string") text += blocks[i].text;
    }
    if (text.length === 0) throw new Error("empty reply");
    const j = JSON.parse(text);
    if (!j || !isPrepArchetype(j.archetype) || !validRgb(j.colorRgb)) throw new Error("bad synth payload");
    // Sanitise through the parametric path so ranges are always valid.
    return parametricIngredient({
      accessNumber: entry.accessNumber,
      name: typeof j.name === "string" && j.name.length > 0 ? j.name.substring(0, 32) : base.name,
      archetype: j.archetype,
      colorRgb: j.colorRgb,
      stemColorRgb: validRgb(j.stemColorRgb) ? j.stemColorRgb : undefined,
      scaleMultiplier: typeof j.scaleMultiplier === "number" ? j.scaleMultiplier : base.scaleMultiplier,
    });
  }

  // ── proteins ──

  /**
   * Resolves the blueprint's protein: #140-#149 (or an old #110-#115 alias) or a cached #250+ entry is a hit;
   * otherwise a parametric fault cached at #250+. `accessNumber` in the result is always the canonical address.
   */
  public resolveProtein(p: UniversalDishBlueprint["protein"]): { spec: UniversalDishBlueprint["protein"]; hit: boolean; accessNumber: number } {
    const n = canonicalProteinNumber(p.accessNumber);
    let known = this.proteinTable[n] || this.dynamicProteins[n] || null;
    if (!known && this.alias[-n] !== undefined) known = this.dynamicProteins[this.alias[-n]] || null;
    if (known) {
      this.lifetimeHits++;
      return { spec: JSON.parse(JSON.stringify(p)), hit: true, accessNumber: known.accessNumber };
    }
    let addr = n;
    const wanted = n >= DYNAMIC_PROTEIN_FIRST && n <= DYNAMIC_PROTEIN_LAST;
    if (!wanted || this.dynamicProteins[addr]) {
      addr = this.nextProteinDynamicAddress;
      while (this.dynamicProteins[addr]) addr++;
    }
    if (addr >= this.nextProteinDynamicAddress) this.nextProteinDynamicAddress = addr + 1;
    this.dynamicProteins[addr] = protein(addr, p.name, p.archetype, p.primaryKine, cloneRgb(p.rawTopRgb), cloneRgb(p.searedCrustRgb), p.lengthCm, p.widthCm, p.heightCm);
    if (addr !== n) this.alias[-n] = addr;
    this.lifetimeFaults++;
    print(`[AssetPageTable] protein page fault #${n} -> parametric entry cached at #${addr}`);
    return { spec: JSON.parse(JSON.stringify(p)), hit: false, accessNumber: addr };
  }
}

// ───────────────────────────── Table 2: vessels, tools & service ware ─────────────────────────────

export type VesselKind = "COOKWARE" | "PREPWARE" | "TOOL" | "SERVEWARE";

export interface VesselToolEntry {
  accessNumber: number;
  key: string;
  name: string;
  kind: VesselKind;
  /** Slot this vessel/tool occupies (SpatialSlotAllocator). */
  slot: SlotId;
  /** Scene prop this configures (existing prop name, or the future prop for the asset phase). */
  propName: string;
  /** Shape parameters from the plan (wallFlare, rimHeight, bellyBulge, rimFlare, ...). Params only, no meshes. */
  params: { [k: string]: number };
  /** What the item is for in the cook (one short phrase). */
  role: string;
  /** Extra prop that travels with the item (e.g. HandiDumLid for the biryani handi). */
  companionProp?: string;
}

function vt(
  n: number, key: string, name: string, kind: VesselKind, slot: SlotId, propName: string, role: string,
  params: { [k: string]: number } = {}, companion?: string
): VesselToolEntry {
  const e: VesselToolEntry = { accessNumber: n, key: key, name: name, kind: kind, slot: slot, propName: propName, params: params, role: role };
  if (companion) e.companionProp = companion;
  return e;
}

export const VESSEL_REGISTRY: VesselToolEntry[] = [
  // cookware
  vt(301, "CAST_IRON_SKILLET", "10-inch Cast-Iron Skillet", "COOKWARE", "SLOT_PRIMARY_BURNER", "SkilletPan", "hard sear / crust", { wallFlare: 1.0, rimHeight: 1.86, diameterIn: 10 }),
  vt(302, "CARBON_STEEL_WOK_KADAI", "Carbon-Steel Wok / Kadai", "COOKWARE", "SLOT_PRIMARY_BURNER", "SkilletPan", "high-heat toss and stir-fry", { wallFlare: 1.18, rimHeight: 2.35, concaveDeg: 32, loopHandles: 2 }),
  vt(303, "BIRYANI_DUM_HANDI", "Biryani Dum Handi + Domed Lid", "COOKWARE", "SLOT_SECONDARY_BURNER", "SaucepotPot", "dum layering, gravy, sealed steam", { bellyBulge: 1.15, rimFlare: 1.08, domedLid: 1 }, "HandiDumLid"),
  vt(304, "TRI_PLY_SAUCIER", "2-qt Tri-Ply Saucier", "COOKWARE", "SLOT_SECONDARY_BURNER", "SaucepotPot", "pan sauce / reduction", { bellyBulge: 1.0, rimFlare: 1.0, capacityQt: 2 }),
  vt(305, "PASTA_RAMEN_STOCKPOT", "Pasta / Ramen Stockpot", "COOKWARE", "SLOT_SECONDARY_BURNER", "SaucepotPot", "boil starch", { bellyBulge: 0.85, rimFlare: 0.95, heightScale: 1.35 }),
  vt(307, "TAWA_GRIDDLE", "Cast Tawa / Griddle", "COOKWARE", "SLOT_PRIMARY_BURNER", "SkilletPan", "flatbread and dry-roast surface", { wallFlare: 0.25, rimHeight: 0.5, discScale: 1.2 }),
  // knives
  vt(321, "SANTOKU_KNIFE", "Japanese Santoku Knife", "TOOL", "SLOT_BOARD_RAIL", "KnifeRoot", "default prep knife", { bladeLen: 1.0, granton: 1 }),
  vt(322, "CHEF_KNIFE", "8-inch Chef Knife", "TOOL", "SLOT_BOARD_RAIL", "KnifeRoot", "rock chop, slicing", { bladeLen: 1.1, belly: 1.0 }),
  vt(323, "VEGETABLE_CLEAVER", "Vegetable Cleaver", "TOOL", "SLOT_BOARD_RAIL", "KnifeRoot", "wide-blade chop and smash", { bladeLen: 0.85, bladeHeight: 1.5 }),
  // prep ware
  vt(325, "STAINLESS_PREP_BOWL", "Stainless Prep Mixing Bowl", "PREPWARE", "SLOT_PREP_BOWL", "PortionRamekinBowl", "portion dome / transfer source", { rimRadius: 3.0 }),
  vt(326, "SPICE_PINCH_RAMEKINS", "Spice Pinch Ramekins", "PREPWARE", "SLOT_SPICE_RAMEKINS", "SpiceRamekins", "powder colours for the pinch step", { count: 3, rimRadius: 1.1 }),
  // tools
  vt(306, "STRAINER_BASKET", "Pasta Strainer Basket", "TOOL", "SLOT_SECONDARY_ACCESSORY", "StrainerBasketProp", "lift and drain starch", { basketDepth: 1.0, meshHoles: 1 }),
  vt(331, "SLOTTED_FISH_SPATULA", "Slotted Fish Turner Spatula", "TOOL", "SLOT_PRIMARY_TOOL_REST", "SpatulaProp", "flip protein 180", {}),
  vt(332, "STAINLESS_GRAVY_LADLE", "Stainless Gravy Ladle", "TOOL", "SLOT_SECONDARY_TOOL_REST", "LadleProp", "orbital stir, pour gravy", {}),
  vt(333, "WOK_CHUAN", "Wok Chuan Spatula", "TOOL", "SLOT_TERTIARY_TOOL_REST", "WokChuanProp", "scoop and toss in the wok", {}),
  vt(334, "BAMBOO_CHOPSTICKS", "Bamboo Cooking Chopsticks", "TOOL", "SLOT_TERTIARY_TOOL_REST", "ChopsticksProp", "lift and toss noodles", {}),
  vt(335, "CHEF_TONGS", "Stainless Chef Tongs", "TOOL", "SLOT_TERTIARY_TOOL_REST", "TongsProp", "turn prawns, twirl pasta", {}),
  vt(336, "BALLOON_WHISK", "Balloon Whisk", "TOOL", "SLOT_TERTIARY_TOOL_REST", "WhiskProp", "emulsify butter sauces", { wireCount: 8 }),
  // service ware
  vt(341, "STONEWARE_COUPE_PLATE", "Matte Stoneware Coupe Plate", "SERVEWARE", "SLOT_SERVICE_PLATE", "PorcelainCoupePlate", "default plate", {}),
  vt(342, "DEEP_NOODLE_BOWL", "Deep Ramen / Noodle / Pasta Bowl", "SERVEWARE", "SLOT_SERVICE_PLATE", "NoodleBowlProp", "auto when dish has #117/#118", { rimRadius: 4.2, depth: 3.2 }),
  vt(343, "BIRYANI_SERVING_HANDI_THALI", "Biryani / Curry Serving Handi & Thali", "SERVEWARE", "SLOT_SERVICE_PLATE", "ServingHandiProp", "auto when dish has #116 or a curry", { rimRadius: 4.0, depth: 3.6 }),
];

/** The three service-ware numbers; at most one is the dish's plate. */
export const SERVEWARE_NUMBERS: number[] = [341, 342, 343];

/**
 * Auto service ware: deep noodle/pasta bowl when the dish has #117/#118, biryani/curry serving handi & thali when it has
 * #116 or a ladle-stirred (gravy / dum) sauce, otherwise the coupe plate.
 */
export function autoServewareFor(bp: UniversalDishBlueprint): number {
  const st = bp && Array.isArray(bp.starchAccessNumbers) ? bp.starchAccessNumbers : [];
  if (st.indexOf(117) >= 0 || st.indexOf(118) >= 0) return 342;
  if (st.indexOf(116) >= 0) return 343;
  if (bp && bp.sauce && bp.sauce.useLadleStir === true) return 343;
  return 341;
}

export interface VesselBatchResult {
  resolved: VesselToolEntry[];
  hits: number;
  /** access numbers not present in the table (no synthesizer for hardware; builders skip them) */
  missing: number[];
  total: number;
}

function cloneVessel(e: VesselToolEntry): VesselToolEntry {
  const o: VesselToolEntry = { accessNumber: e.accessNumber, key: e.key, name: e.name, kind: e.kind, slot: e.slot, propName: e.propName, params: { ...e.params }, role: e.role };
  if (e.companionProp) o.companionProp = e.companionProp;
  return o;
}

export class VesselToolPageTable {
  private table: { [n: number]: VesselToolEntry } = {};

  constructor() {
    for (let i = 0; i < VESSEL_REGISTRY.length; i++) this.table[VESSEL_REGISTRY[i].accessNumber] = VESSEL_REGISTRY[i];
  }

  /** Looks up a vessel/tool (old aliases such as #311 resolve to their canonical entry). */
  public get(accessNumber: number): VesselToolEntry | null {
    return this.table[canonicalVesselNumber(accessNumber)] || null;
  }

  /** Loader B: resolves a deduplicated list of vessel/tool/service-ware access numbers (aliases resolved, canonical numbers returned). */
  public resolveBatch(accessNumbers: number[]): Promise<VesselBatchResult> {
    const seen: { [n: number]: boolean } = {};
    const resolved: VesselToolEntry[] = [];
    const missing: number[] = [];
    let total = 0;
    for (let i = 0; i < accessNumbers.length; i++) {
      const n = canonicalVesselNumber(accessNumbers[i]);
      if (seen[n]) continue;
      seen[n] = true;
      total++;
      const e = this.table[n];
      if (e) resolved.push(cloneVessel(e));
      else missing.push(accessNumbers[i]);
    }
    return Promise.resolve({ resolved: resolved, hits: resolved.length, missing: missing, total: total });
  }
}

// ───────────────────────────── facade ─────────────────────────────

export interface BatchLoadResult {
  /** Resolved prep slots in lane order. */
  ingredients: PrepSlotEntry[];
  /** Resolved starches (#116-#121) and spices/dairy/oils/legumes (#160-#166), request order. */
  starches: PrepSlotEntry[];
  spices: PrepSlotEntry[];
  /** Resolved protein spec (blueprint values) + whether it was a table hit; accessNumber is canonical. */
  protein: { spec: UniversalDishBlueprint["protein"]; hit: boolean; accessNumber: number };
  /** Resolved vessels/tools/service ware (deduplicated, request order, canonical numbers; auto service ware appended). */
  vessels: VesselToolEntry[];
  /** Service-ware number that is the dish's plate/bowl/handi (#341/#342/#343). */
  servewareAccessNumber: number;
  /** Loader A totals: all ingredient lookups (5 veg + starches + spices) + 1 protein lookup. */
  cacheHits: number;
  pageFaults: number;
  /** Ingredient-only counters (veg + starch + spice) used by the status line. */
  ingredientHits: number;
  ingredientFaults: number;
  ingredientTotal: number;
  /** Deprecated aliases of ingredient* (kept for older readers). */
  vegHits: number;
  vegFaults: number;
  vegTotal: number;
  vesselHits: number;
  vesselTotal: number;
  /** Vessel/tool numbers that are not in the table. */
  vesselMissing: number[];
  statusLine: string;
}

export interface PageTableStats {
  last: BatchLoadResult | null;
  statusLine: string;
  lifetimeHits: number;
  lifetimeFaults: number;
  dynamicEntries: number;
  nextDynamicAddress: number;
}

const ingredientTable = new IngredientPageTable();
const vesselTable = new VesselToolPageTable();
let lastBatch: BatchLoadResult | null = null;

/** e.g. "PAGE TABLE: 5/5 INGREDIENTS HIT • 7/7 VESSELS & ACCESSORIES LOADED" (adds "• n SYNTH" when pages were synthesized). */
export function buildStatusLine(ingHits: number, ingTotal: number, ingFaults: number, vesselHits: number, vesselTotal: number): string {
  let s = `PAGE TABLE: ${ingHits}/${ingTotal} INGREDIENTS HIT`;
  if (ingFaults > 0) s += ` • ${ingFaults} SYNTH`;
  s += ` • ${vesselHits}/${vesselTotal} VESSELS & ACCESSORIES LOADED`;
  return s;
}

function numList(a: any): number[] {
  const out: number[] = [];
  if (!Array.isArray(a)) return out;
  for (let i = 0; i < a.length; i++) if (typeof a[i] === "number" && isFinite(a[i])) out.push(a[i]);
  return out;
}

/**
 * Placeholder lookup entry for a bare access number (starch / spice lists). Registered numbers keep every catalogue value
 * (archetype/colour/scale are deliberately invalid so mergeHit falls back to the registry); unknown numbers page-fault into a
 * parametric entry of the range's archetype.
 */
function placeholderFor(n: number, known: boolean): PrepSlotEntry {
  if (known) return { accessNumber: n, name: "", archetype: "" as any, colorRgb: [NaN, NaN, NaN] as any, scaleMultiplier: NaN };
  const spice = n >= 160 && n <= 166;
  const arch: PrepArchetype = spice ? "GRANULAR_MOUND" : n >= 116 && n <= 121 ? "GRANULAR_MOUND" : "CYLINDER_STALK";
  return { accessNumber: n, name: (spice ? "Pantry item #" : "Starch #") + n, archetype: arch, colorRgb: [NaN, NaN, NaN] as any, scaleMultiplier: NaN };
}

export const AssetPageTable = {
  ingredients: ingredientTable,
  vessels: vesselTable,

  /** Installs the HTTP/timer hook used by the optional live synthesizer. Safe to call repeatedly; null removes it. */
  setRuntime(rt: PageTableRuntime | null): void {
    runtime = rt;
  },

  /**
   * Loader A (5 prep slots + starches + spices + protein) and Loader B (vessels + tools + auto service ware) run in
   * parallel via Promise.all. The status line counts the blueprint's real access numbers.
   * Never rejects for unknown access numbers: unknown ingredients page-fault and are synthesized; unknown vessels are reported.
   */
  async batchLoad(bp: UniversalDishBlueprint): Promise<BatchLoadResult> {
    const starchNums = numList(bp.starchAccessNumbers);
    const spiceNums = numList(bp.spiceAccessNumbers);
    const entries: PrepSlotEntry[] = (bp.prepSlots as PrepSlotEntry[]).slice();
    for (let i = 0; i < starchNums.length; i++) entries.push(placeholderFor(starchNums[i], ingredientTable.has(starchNums[i])));
    for (let i = 0; i < spiceNums.length; i++) entries.push(placeholderFor(spiceNums[i], ingredientTable.has(spiceNums[i])));

    // service ware: keep the dish's own plate/bowl if listed, otherwise add the automatic one
    const wanted: number[] = numList(bp.vesselAccessNumbers).concat(numList(bp.toolAccessNumbers));
    let serveware = -1;
    for (let i = 0; i < wanted.length; i++) if (SERVEWARE_NUMBERS.indexOf(wanted[i]) >= 0) serveware = wanted[i];
    if (serveware < 0) {
      serveware = autoServewareFor(bp);
      wanted.push(serveware);
    }

    const loaderA = ingredientTable.resolveIngredientBatch(entries).then((r) => {
      const p = ingredientTable.resolveProtein(bp.protein);
      return { r: r, p: p };
    });
    const loaderB = vesselTable.resolveBatch(wanted);
    const both = await Promise.all([loaderA, loaderB]);
    const a = both[0];
    const b = both[1];
    const nLanes = bp.prepSlots.length;
    const out: BatchLoadResult = {
      ingredients: a.r.resolved.slice(0, nLanes),
      starches: a.r.resolved.slice(nLanes, nLanes + starchNums.length),
      spices: a.r.resolved.slice(nLanes + starchNums.length),
      protein: a.p,
      vessels: b.resolved,
      servewareAccessNumber: serveware,
      cacheHits: a.r.hits + (a.p.hit ? 1 : 0),
      pageFaults: a.r.faults + (a.p.hit ? 0 : 1),
      ingredientHits: a.r.hits,
      ingredientFaults: a.r.faults,
      ingredientTotal: entries.length,
      vegHits: a.r.hits,
      vegFaults: a.r.faults,
      vegTotal: entries.length,
      vesselHits: b.hits,
      vesselTotal: b.total,
      vesselMissing: b.missing,
      statusLine: buildStatusLine(a.r.hits, entries.length, a.r.faults, b.hits, b.total),
    };
    lastBatch = out;
    return out;
  },

  /** Status line text for the briefing deck plus lifetime counters. */
  getStats(): PageTableStats {
    return {
      last: lastBatch,
      statusLine: lastBatch ? lastBatch.statusLine : "PAGE TABLE: IDLE",
      lifetimeHits: ingredientTable.lifetimeHits,
      lifetimeFaults: ingredientTable.lifetimeFaults,
      dynamicEntries: ingredientTable.dynamicCount(),
      nextDynamicAddress: ingredientTable.nextDynamicAddress,
    };
  },

  /** Clears the dynamic page-fault cache and counters (self-checks only). */
  reset(): void {
    ingredientTable.reset();
    lastBatch = null;
  },
};
