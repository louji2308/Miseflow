/**
 * CookBenchPlan.ts  (Chef Director v6, W3: pure bench planning for CookStage)
 *
 * planBench(plan) decides, without touching the scene, what each plan entry looks like and where it goes:
 * burners 1..3 along the back row (plan.equipment[].burner, heated vessels without one get a free burner), board
 * centre-front, plate front-right, bowls / other prep ware left, the main mass (protein / flour / dough) of a bowl /
 * board step inside that equipment, other ingredients staged in front of the equipment of their first step, tools next
 * to the vessel they are first used on. Every footprint goes through CookLayout.BenchAllocator (no overlaps, nothing
 * off the slab). No Lens API here (node-testable).
 */
import type { CookEquipment, CookIngredient, CookPlan, CookStep, CookTool } from "./CookPlanSchema";
import { BenchAllocator, BENCH, Disc, LayoutViolation, Placed, Pose, rectShape, toolShape } from "./CookLayout";

const DEG = Math.PI / 180;
export const HEATED = ["WOK", "KADAI", "TAWA", "SKILLET", "POT", "SAUCEPAN", "FRYER_PAN", "STEAMER", "HANDI"];

/** Chunk count for a protein amount ("500 g" -> 12). */
export function pieceCountFor(amount: string, def: number = 12): number {
  const m = /([0-9]+(?:\.[0-9]+)?)\s*(kg|g)/i.exec(amount || "");
  if (!m) return def;
  const g = parseFloat(m[1]) * (m[2].toLowerCase() === "kg" ? 1000 : 1);
  return Math.max(8, Math.min(14, Math.round(g / 40)));
}

// ───────────────────────────── equipment specs ─────────────────────────────

export interface EqSpec {
  kind: string;
  small: boolean;
  footR: number;
  /** handle discs along the shape's local +X (and -X when twin) */
  handleLen: number;
  twin: boolean;
  /** generator angle (deg, local frame) of the handle that maps onto the shape's +X */
  genHandleDeg: number;
  rect: boolean;
}

export function isSmall(e: CookEquipment): boolean {
  return /small|temper|tadka|tempering|second|mini/i.test(e.role || "");
}

function bowlR(e: CookEquipment): number {
  if (isSmall(e)) return 2.8;
  return /dough|mixing|marinade|marinate|large|batter/i.test(e.role || "") ? 4.2 : 3.4;
}

export function wokScale(small: boolean): number {
  return small ? 0.42 : 0.6;
}

export function eqSpec(e: CookEquipment, k: number): EqSpec {
  const kind = String(e.kind || "BOWL").toUpperCase();
  const small = isSmall(e);
  const s: EqSpec = { kind, small, footR: 4, handleLen: 0, twin: false, genHandleDeg: 0, rect: false };
  switch (kind) {
    case "WOK": { const w = wokScale(small) * k; s.footR = 9.98 * w; s.handleLen = (19.4 - 9.98) * w; s.genHandleDeg = 168; break; }
    case "KADAI":
    case "FRYER_PAN": { const w = wokScale(small) * k; s.footR = 9.98 * w; s.handleLen = 2.1 * w; s.twin = true; s.genHandleDeg = 168; break; }
    case "TAWA": { const w = (small ? 0.45 : 0.6) * k; s.footR = 9.45 * w; s.handleLen = (17.8 - 9.45) * w; s.genHandleDeg = 168; break; }
    case "POT":
    case "STEAMER": { const w = (small ? 0.65 : 0.8) * k; s.footR = 5.0 * w; s.handleLen = 2.1 * w; s.twin = true; s.genHandleDeg = 90; break; }
    case "HANDI": { const w = (small ? 0.65 : 0.8) * k; s.footR = 5.8 * w; break; }
    case "SKILLET": { const w = (small ? 0.75 : 1) * k; s.footR = 6.15 * w; s.handleLen = 8.6 * w; s.genHandleDeg = 180; break; }
    case "SAUCEPAN": { const w = (small ? 0.8 : 1) * k; s.footR = 4.22 * w; s.handleLen = 8.6 * w; s.genHandleDeg = 180; break; }
    case "PLATE": s.footR = small ? 4.4 : 5.6; break;
    case "BOARD": s.footR = 9; s.rect = true; break;
    default: s.footR = bowlR(e); break; // BOWL and unknown
  }
  return s;
}

export function eqShape(s: EqSpec): Disc[] {
  if (s.rect) {
    const d = rectShape(7.5, 5.0);
    d.push({ x: 8.3, z: 0, r: 2.1 }); // W2 board handle tab (+X)
    return d;
  }
  const out: Disc[] = [{ x: 0, z: 0, r: s.footR }];
  const hl = s.handleLen;
  if (hl > 0.4) {
    const w = 0.7;
    const n = Math.max(1, Math.ceil(hl / 1.4));
    for (const sg of s.twin ? [1, -1] : [1]) {
      for (let i = 1; i <= n; i++) out.push({ x: sg * (s.footR + (hl * i) / n - w * 0.5), z: 0, r: w, soft: true });
    }
  }
  return out;
}

// ───────────────────────────── ingredient look ─────────────────────────────

const VEG_WORDS: [RegExp, number][] = [
  [/shallot|onion/, 101], [/garlic/, 102], [/coriander|cilantro|parsley|mint|basil|herb|dill/, 103], [/tomato/, 104],
  [/chil+i|chili|jalapeno/, 105], [/cucumber|zucchini/, 106], [/carrot|asparagus/, 107], [/mushroom/, 108],
  [/ginger|paneer|tofu/, 109], [/bell pepper|capsicum/, 122], [/broccoli|cauliflower/, 123], [/spinach|cabbage|bok choy|kale/, 124],
  [/eggplant|brinjal|aubergine/, 125], [/scallion|spring onion/, 126], [/corn|peas?\b/, 127], [/lemon|lime/, 128],
  [/avocado|mango/, 129], [/beet|radish/, 130], [/potato/, 119],
];

export type Look =
  | { t: "shape"; kind: string; count?: number; containerFirst?: boolean }
  | { t: "veg"; n: number }
  | { t: "fallback"; kind: string; count?: number };

function vegNumberFor(name: string): number {
  const n = name.toLowerCase();
  for (const [re, num] of VEG_WORDS) if (re.test(n)) return num;
  return 0;
}

export function lookFor(ing: CookIngredient, inContainer: boolean): Look {
  const name = String(ing.name || "").toLowerCase();
  const form = String(ing.form || "").toLowerCase();
  const role = String(ing.role || "").toUpperCase();
  const hint = typeof ing.catalogueHint === "number" ? ing.catalogueHint : 0;
  const text = name + " " + form;
  if (role === "PROTEIN" || (hint >= 140 && hint <= 149)) {
    if (/prawn|shrimp/.test(text) || hint === 143) return { t: "fallback", kind: "PRAWNS", count: pieceCountFor(ing.amount, 8) };
    if (/kofta|meatball|ball/.test(text) || hint === 148) return { t: "fallback", kind: "PROTEIN_BALLS", count: pieceCountFor(ing.amount, 8) };
    if (/fillet|steak|slab|whole fish|breast|chop/.test(text) || hint === 140 || hint === 141 || hint === 146 || hint === 147) return { t: "fallback", kind: "PROTEIN_SLAB", count: 2 };
    return { t: "shape", kind: "IRREGULAR_CHICKEN_CHUNKS", count: pieceCountFor(ing.amount, 12) };
  }
  if (role === "DOUGH" || hint === 120) {
    if (/disc|flat|rolled/.test(form) && !/ball/.test(form)) return { t: "shape", kind: "FLATBREAD_DISC" };
    return { t: "shape", kind: "DOUGH_BALL" };
  }
  if (/curry lea/.test(name)) return { t: "shape", kind: "CURRY_LEAF_SPRIG" };
  if (/(lemon|lime).*(wedge|slice)|(wedge|slice).*(lemon|lime)/.test(text) || (role === "GARNISH" && /lemon|lime/.test(name))) return { t: "shape", kind: "LEMON_WEDGE", count: 2 };
  if (role === "FLOUR" || hint === 163 || hint === 166 || hint === 116 || hint === 117 || hint === 118) {
    if (inContainer) return { t: "fallback", kind: "FLOUR_MOUND" };
    return role === "FLOUR" ? { t: "shape", kind: "FLOUR_DISH", containerFirst: true } : { t: "fallback", kind: "GRAIN_HEAP" };
  }
  if (role === "OIL" || role === "LIQUID" || hint === 165 || /water|stock|milk|oil|vinegar|juice|soy/.test(name)) return { t: "fallback", kind: "LIQUID_CUP" };
  if (role === "DAIRY" || hint === 162 || hint === 164 || /paste|sauce|puree|curd|yog|cream|butter|ghee/.test(name)) return { t: "fallback", kind: "DAIRY_CUP" };
  if (role === "SPICE" || hint === 160 || hint === 161 || /powder|masala|salt|sugar|seed|ground/.test(name)) {
    if (/powder|masala|salt|sugar|seed|ground|spice/.test(name) || hint === 161) return { t: "fallback", kind: "SPICE_RAMEKIN" };
  }
  const vn = (hint >= 101 && hint <= 130) || hint === 119 ? hint : vegNumberFor(name);
  if (vn > 0) return { t: "veg", n: vn };
  if (role === "VEG" || role === "AROMATIC" || role === "GARNISH") return { t: "veg", n: 0 };
  if (role === "SPICE") return { t: "fallback", kind: "SPICE_RAMEKIN" };
  return { t: "fallback", kind: "GENERIC_PIECE" };
}

/** Footprint (local discs) of an ingredient staged on the bench. */
export function lookShape(l: Look): Disc[] {
  const k = l.t === "veg" ? "VEG" : l.kind;
  switch (k) {
    case "FLOUR_DISH": return [{ x: 0, z: 0, r: 2.75 }];
    case "GRAIN_HEAP": return [{ x: 0, z: 0, r: 2.75 }];
    case "SPICE_RAMEKIN": return [{ x: 0, z: 0, r: 1.45 }];
    case "LIQUID_CUP":
    case "DAIRY_CUP": return [{ x: 0, z: 0, r: 1.65 }];
    case "CURRY_LEAF_SPRIG": return [{ x: -1.8, z: 0, r: 1.2 }, { x: 0, z: 0, r: 1.2 }, { x: 1.8, z: 0, r: 1.2 }];
    case "LEMON_WEDGE": return [{ x: -0.8, z: 0, r: 1.6 }, { x: 0.8, z: 0, r: 1.6 }];
    case "IRREGULAR_CHICKEN_CHUNKS":
    case "PROTEIN_SLAB":
    case "PROTEIN_BALLS":
    case "PRAWNS": return [{ x: 0, z: 0, r: 3.5 }]; // on its own tray plate
    case "DOUGH_BALL": return [{ x: 0, z: 0, r: 1.8 }];
    case "FLATBREAD_DISC": return [{ x: 0, z: 0, r: 3.3 }];
    case "VEG": return [{ x: 0, z: 0, r: 1.45 }];
    default: return [{ x: 0, z: 0, r: 1.4 }];
  }
}

export function firstStepOf(plan: CookPlan, pred: (s: CookStep) => boolean): CookStep | null {
  for (const s of plan.steps || []) if (pred(s)) return s;
  return null;
}



export interface BenchPlan {
  eqList: CookEquipment[];
  plateEq: CookEquipment;
  burnerOf: { [id: string]: number };
  row: CookEquipment[];
  specOf: { [id: string]: EqSpec };
  poseOf: { [id: string]: Pose };
  hostOf: { [ingId: string]: string };
  hosted: { [eqId: string]: string[] };
  looks: { [id: string]: Look };
  ingPose: { [id: string]: Pose };
  toolPose: { [id: string]: Pose };
  violations: LayoutViolation[];
  layoutLog: { key: string; x: number; z: number; angDeg: number }[];
  alloc: BenchAllocator;
}

export function planBench(plan: CookPlan): BenchPlan {
  const alloc = new BenchAllocator();
  const layoutLog: { key: string; x: number; z: number; angDeg: number }[] = [];
  const logPose = (key: string, p: Pose) => layoutLog.push({ key, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, angDeg: Math.round(p.ang / DEG) });
  const eqList: CookEquipment[] = (plan.equipment || []).slice();
  const plateId = plan.plateEquipmentId && eqList.some((e) => e.id === plan.plateEquipmentId) ? plan.plateEquipmentId : (eqList.find((e) => String(e.kind).toUpperCase() === "PLATE") || { id: "" }).id;
  let plateEq: CookEquipment | null = plateId ? eqList.find((e) => e.id === plateId) || null : null;
  if (!plateEq) {
    plateEq = { id: "plate", kind: "PLATE", role: "serving plate", burner: 0 };
    eqList.push(plateEq);
  }
  // burners: explicit 1..3 first, then heated vessels without a burner fill the free numbers
  const burnerOf: { [id: string]: number } = {};
  const used: number[] = [];
  for (const e of eqList) {
    const b = Math.floor(e.burner || 0);
    if (b >= 1 && b <= 3 && HEATED.indexOf(String(e.kind).toUpperCase()) >= 0 && used.indexOf(b) < 0) {
      burnerOf[e.id] = b;
      used.push(b);
    }
  }
  for (const e of eqList) {
    if (burnerOf[e.id] || HEATED.indexOf(String(e.kind).toUpperCase()) < 0) continue;
    for (let b = 1; b <= 3; b++) if (used.indexOf(b) < 0) {
      burnerOf[e.id] = b;
      used.push(b);
      break;
    }
  }
  const row = eqList.filter((e) => burnerOf[e.id]).sort((a, b) => burnerOf[a.id] - burnerOf[b.id]);
  // shrink the row if it does not fit the bench width
  const rowGap = 2.2;
  const widthOf = (k: number) => {
    let w = 0;
    for (const e of row) {
      const s = eqSpec(e, k);
      w += 2 * (s.twin ? s.footR + s.handleLen : s.footR) + rowGap;
    }
    return w - rowGap;
  };
  let rowK = 1;
  const maxW = BENCH.maxX - BENCH.minX - 2;
  if (row.length > 0 && widthOf(1) > maxW) rowK = Math.max(0.6, maxW / widthOf(1));
  const specOf: { [id: string]: EqSpec } = {};
  for (const e of eqList) specOf[e.id] = eqSpec(e, burnerOf[e.id] ? rowK : 1);
  const poseOf: { [id: string]: Pose } = {};
  {
    let x = -widthOf(rowK) / 2;
    let rmax = 0;
    for (const e of row) rmax = Math.max(rmax, specOf[e.id].footR);
    const z = Math.min(-9.0, BENCH.minZ + 0.6 + rmax);
    for (const e of row) {
      const s = specOf[e.id];
      const half = s.twin ? s.footR + s.handleLen : s.footR;
      const cx = x + half;
      x += 2 * half + rowGap;
      const pref = s.twin ? 0 : cx < -2 ? 225 * DEG : cx > 2 ? 315 * DEG : 270 * DEG;
      const tries = s.twin ? [0, Math.PI / 2] : [pref, 270 * DEG, cx < 0 ? Math.PI : 0, 225 * DEG, 315 * DEG];
      let pl: Placed | null = null;
      for (const a of tries) {
        pl = alloc.place("eq:" + e.id, eqShape(s), [{ x: cx, z, ang: a }], { x: cx, z }, [a]);
        if (pl && Math.abs(pl.pose.x - cx) < 0.01 && Math.abs(pl.pose.z - z) < 0.01) break;
        if (pl) {
          alloc.placed.pop();
          pl = null;
        }
      }
      if (!pl) pl = alloc.force("eq:" + e.id, eqShape(s), { x: cx, z, ang: tries[0] });
      poseOf[e.id] = pl.pose;
      logPose("eq:" + e.id, pl.pose);
    }
  }
  // board centre-front, plate front-right, bowls / other equipment left
  const placeEq = (e: CookEquipment, cands: Pose[], near: { x: number; z: number }) => {
    const s = specOf[e.id];
    const pl = alloc.place("eq:" + e.id, eqShape(s), cands, near, s.rect ? [0, Math.PI] : [0, Math.PI / 2, Math.PI, -Math.PI / 2])
      || alloc.force("eq:" + e.id, eqShape(s), { x: near.x, z: near.z, ang: 0 });
    poseOf[e.id] = pl.pose;
    logPose("eq:" + e.id, pl.pose);
  };
  for (const e of eqList) if (!poseOf[e.id] && String(e.kind).toUpperCase() === "BOARD") placeEq(e, [{ x: -2.6, z: 5.4, ang: 0 }, { x: -2.6, z: 4.4, ang: 0 }], { x: -2.6, z: 5 });
  placeEq(plateEq, [{ x: 14.6, z: 5.0, ang: 0 }, { x: 14.6, z: 4.0, ang: 0 }], { x: 14.5, z: 5 });
  let leftZ = 4.4;
  for (const e of eqList) {
    if (poseOf[e.id]) continue;
    const r = specOf[e.id].footR;
    placeEq(e, [{ x: BENCH.minX + 1.2 + r, z: leftZ, ang: 0 }], { x: -15, z: leftZ });
    leftZ -= 2 * r + 1.0;
  }

  // ingredients: the main mass (protein / flour / dough) of a bowl / board / plate step starts inside that equipment
  const ingList: CookIngredient[] = (plan.ingredients || []).slice();
  const hostOf: { [ingId: string]: string } = {};
  const hosted: { [eqId: string]: string[] } = {};
  for (const ing of ingList) {
    const role = String(ing.role).toUpperCase();
    if (role !== "PROTEIN" && role !== "FLOUR" && role !== "DOUGH") continue;
    const st = firstStepOf(plan, (s) => (s.ingredientIds || []).indexOf(ing.id) >= 0);
    if (!st) continue;
    const eq = eqList.find((e) => e.id === st.equipmentId);
    if (!eq || ["BOWL", "BOARD", "PLATE"].indexOf(String(eq.kind).toUpperCase()) < 0) continue;
    const h = hosted[eq.id] || [];
    const roles = h.map((id) => String((ingList.find((i) => i.id === id) as CookIngredient).role).toUpperCase());
    const ok = h.length === 0 || (h.length === 1 && ((role === "DOUGH" && roles[0] === "FLOUR") || (role === "FLOUR" && roles[0] === "DOUGH")));
    if (!ok) continue;
    hostOf[ing.id] = eq.id;
    hosted[eq.id] = h.concat([ing.id]);
  }
  const looks: { [id: string]: Look } = {};
  for (const ing of ingList) looks[ing.id] = lookFor(ing, !!hostOf[ing.id]);
  const nearFront = (eqId: string): { x: number; z: number } => {
    const p = poseOf[eqId];
    if (!p) return { x: -14, z: 7 };
    const r = specOf[eqId] ? specOf[eqId].footR : 3;
    return { x: p.x, z: Math.min(BENCH.maxZ - 1.5, p.z + r + 2.4) };
  };

  // tools next to the vessel of their first use
  const toolList: CookTool[] = (plan.tools || []).slice();
  const toolPose: { [id: string]: Pose } = {};
  // ingredient poses
  const ingPose: { [id: string]: Pose } = {};
  for (const ing of ingList) {
    if (hostOf[ing.id]) continue;
    const st = firstStepOf(plan, (s) => (s.ingredientIds || []).indexOf(ing.id) >= 0);
    const near = st ? nearFront(st.equipmentId) : { x: -14, z: 7 };
    const pl = alloc.place("ing:" + ing.id, lookShape(looks[ing.id]), [], near, [0, Math.PI / 2])
      || alloc.force("ing:" + ing.id, lookShape(looks[ing.id]), { x: BENCH.maxX - 2, z: BENCH.maxZ - 2, ang: 0 });
    ingPose[ing.id] = pl.pose;
    logPose("ing:" + ing.id, pl.pose);
  }
  for (const t of toolList) {
    const st = firstStepOf(plan, (s) => s.toolId === t.id);
    const near = st ? nearFront(st.equipmentId) : { x: 0, z: -1.5 };
    // provisional size by kind; the real build happens in its job (same numbers)
    const L: { [k: string]: [number, number] } = {
      SPATULA: [12.6, 1.2], KNIFE: [11.2, 0.6], TONGS: [18.5 * 0.62, 0.62], CHOPSTICKS: [18 * 0.62, 0.45], WHISK: [13.2 * 0.72, 1.3 * 0.72],
      LADLE: [16.3 * 0.7, 1.0], ROLLING_PIN: [2 * 18.7 * 0.36, 1.0], SKIMMER: [27 * 0.45, 5 * 0.45], BRUSH: [18 * 0.6, 0.7], SPOON: [26 * 0.48, 1.06],
    };
    const lk = L[String(t.kind).toUpperCase()] || L.SPOON;
    const shape = toolShape(lk[0], lk[1]);
    const angs = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const pl = alloc.place("tool:" + t.id, shape, [], near, angs)
      || alloc.force("tool:" + t.id, shape, { x: 0, z: BENCH.maxZ - 1.5, ang: 0 });
    toolPose[t.id] = pl.pose;
    logPose("tool:" + t.id, pl.pose);
  }
  const violations = alloc.violations();
  return { eqList, plateEq: plateEq as CookEquipment, burnerOf, row, specOf, poseOf, hostOf, hosted, looks, ingPose, toolPose, violations, layoutLog, alloc };
}
