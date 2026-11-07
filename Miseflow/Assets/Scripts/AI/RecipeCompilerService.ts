import { MiseFlowEventBus, DishCompileRequestedPayload } from "../MiseFlowEventBus";
import { getApiKey, getModel, isLiveEnabled } from "./AiModelConfig";
import { getPreset, matchByKeyword, nextPresetIndex, PRESET_COUNT } from "./DishLibraryConfig";
import { AssetPageTable, BatchLoadResult, VesselKind } from "./AssetPageTable";
import { DishAssetBuilders, StagedDishItem, StagedItemGroup } from "./IDishAssetBuilder";
import { ProposalGate } from "./ProposalGate";
import { NOT_FOUND_MESSAGE, UniversalDishBlueprint, UniversalDishJsonSchema } from "./UniversalDishSchema";

const ENDPOINT_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const COMPILE_TIMEOUT_MS = 4500;
const COMPILE_MAX_TOKENS = 4500;

const COMPILER_SYSTEM_PROMPT = [
  "You are the MiseFlow dish compiler for an AR cooking coach. Convert the user's dish request into ONE UniversalDishBlueprint JSON object.",
  "NOT A DISH: if the request is not a real, cookable dish (gibberish, an object, a place, a person, an instruction, a non-food), return found=false, notFoundMessage=\"" + NOT_FOUND_MESSAGE + "\", and harmless placeholder values for every other field. For a real dish return found=true and notFoundMessage=\"" + NOT_FOUND_MESSAGE + "\".",
  "Rules:",
  "- Four stations only: PREP (5 vegetable lanes), SKILLET (one protein, sear/saute/toss), SAUCEPOT (two-pour sauce / dum / boil), PLATING. cookbookCards are exactly 4, in the order PREP, SKILLET, SAUCEPOT, PLATING.",
  "- prepSlots has exactly 5 entries; ingredientAccessNumbers must equal their accessNumber values. Vegetables: 101 red onion/shallot, 102 garlic, 103 herbs, 104 tomato, 105 chilli, 106 cucumber/zucchini, 107 carrot/asparagus, 108 mushroom, 109 ginger/paneer block, 122 bell pepper, 123 broccoli/cauliflower, 124 bok choy/cabbage/spinach, 125 eggplant, 126 scallion, 127 sweet corn/peas, 128 lemon/lime, 129 avocado/mango, 130 beetroot/radish. For anything else use 200-249 and the closest archetype.",
  "- starchAccessNumbers (0-2): 116 rice, 117 ramen/hakka/udon noodles, 118 pasta, 119 potato, 120 dough/flatbread, 121 bread/brioche. spiceAccessNumbers (0-4): 160 whole garam masala, 161 ground spice powders, 162 butter/ghee, 163 grated cheese, 164 cream/coconut/yogurt, 165 oils and umami glazes, 166 lentils/dal/chickpeas.",
  "- Archetypes: prep BULB_ALLIUM, CYLINDER_STALK, SPHERE_CROWN, LEAFY_HERB, CUBED_BLOCK, GRANULAR, GRANULAR_MOUND, STRAND_TANGLE, TUBE_ARRAY, DISC_SHEET, SPICE_CLUSTER, LIQUID_SWIRL; protein FILLET_SLAB, MARBLED_STEAK, MEDALLION_SCALLOP, CUBED_SEAR, DISC_SHEET. Protein accessNumber 140 salmon, 141 ribeye, 142 chicken tikka/marinated cubes/mushroom, 143 tiger prawns, 144 scallops, 145 eggs, 146 paneer, 147 tofu, 148 kofta, 149 bacon, or 250-299 for others.",
  "- vesselAccessNumbers (cookware and prep ware, 1-12): 301 cast-iron skillet, 302 wok/kadai, 303 biryani dum handi + lid, 304 saucier, 305 pasta/ramen stockpot, 307 tawa/griddle, 325 prep bowl, 326 spice ramekins. toolAccessNumbers (0-12): 321 santoku, 322 chef knife, 323 vegetable cleaver, 306 strainer basket, 331 fish spatula, 332 gravy ladle, 333 wok chuan, 334 chopsticks, 335 tongs, 336 whisk. The plate or bowl (341 coupe, 342 deep noodle/pasta bowl, 343 biryani/curry serving handi) is chosen automatically: do not list it. All numbers are within 301-355.",
  "- sauce.vesselAccessNumber is the SAUCEPOT cookware (303 handi, 304 saucier or 305 stockpot).",
  "- Ranges: prepDurationSec 5-900, searDurationSec 10-600, sauceDurationSec 10-600, cutSpacingCm 0.4-2.0, cutAngleDeg 0 or 45, colours are linear RGB 0-1, protein lengthCm 2-14, widthCm 2-10, heightCm 0.8-5.",
  "- steps has 4-9 entries in cook order: id (snake_case, <= 24 chars, unique), station, kinematic, durationSec 1-600, title (<= 28 chars), whatWhy (<= 90 chars: what to do + why it works). Kinematic is one of KINE_ROCK_CHOP, KINE_TWO_STAGE_POUR, KINE_SPATULA_FLIP_180, KINE_PAN_TOSS_ROLL, KINE_LADLE_ORBITAL_STIR, KINE_NOODLE_LIFT_TOSS, KINE_RICE_DUM_LAYER, KINE_WHISK_EMULSION, KINE_CONVERGENCE_PLATING. PREP step durations sum to prepDurationSec, SKILLET to searDurationSec, SAUCEPOT to sauceDurationSec; end with one PLATING step (KINE_CONVERGENCE_PLATING).",
  "- Text limits: headline <= 28 chars, instruction <= 75 chars, masteryWhy <= 65 chars (explain WHY the technique works), dishTitle <= 32, cuisineTag <= 24, flipCalloutText <= 24, pill verbs <= 8 chars uppercase.",
  "- useLadleStir true only for gravy/handi style sauces. primaryKine is KINE_SPATULA_FLIP_180 for slabs/steaks/discs, KINE_PAN_TOSS_ROLL for wok/cubed/prawn items.",
  "- dishId format like 07_short_snake_case. Reply with the JSON object only.",
].join("\n");

/** Short loading-chip names for vessels, tools and service ware. */
const SHORT_WARE: { [n: number]: string } = {
  301: "SKILLET", 302: "WOK", 303: "DUM HANDI", 304: "SAUCIER", 305: "STOCKPOT", 306: "STRAINER", 307: "TAWA",
  321: "SANTOKU", 322: "CHEF KNIFE", 323: "CLEAVER", 325: "PREP BOWL", 326: "RAMEKINS", 331: "SPATULA", 332: "LADLE",
  333: "WOK CHUAN", 334: "CHOPSTICKS", 335: "TONGS", 336: "WHISK", 341: "COUPE PLATE", 342: "NOODLE BOWL", 343: "SERVING HANDI",
};

interface StageState {
  dishId: string;
  items: StagedDishItem[];
  apply: { [key: string]: () => void };
  ready: boolean[];
  revealed: { [key: string]: boolean };
  indexOf: { [key: string]: number };
}

/**
 * RecipeCompilerService.ts
 * Turns a dish request (HUD cycle, voice phrase, LEAF) into a validated UniversalDishBlueprint and broadcasts it.
 *
 * - Preset path (default): DishLibraryConfig lookup by presetIndex or keyword, synchronous (<1 ms), no network.
 * - Live path: only when AiModelConfig.isLiveEnabled("compiler") (model id AND key set) and the query matches no preset.
 *   Anthropic Messages API + structured output, 4500 ms timeout. found:false, a failed validation or ANY failure emits
 *   DISH_NOT_FOUND {query, message} (default "Dish not found. Enter the correct dish name."); no silent substitute dish.
 * - No preset match and live disabled: DISH_NOT_FOUND as well. Explicit presetIndex requests (Key 8 / chips) and an empty
 *   query (cycle) are unaffected.
 * - Every blueprint passes ProposalGate.validateDishBlueprint before DISH_BLUEPRINT_APPLIED is emitted.
 * - Boot default is preset 0 (01_salmon_beurre_blanc) with no briefing; RESET_REQUESTED returns to preset 0.
 * Never throws.
 */
@component
export class RecipeCompilerService extends BaseScriptComponent {
  /** Master switch for the live path. Live still needs a compiler model id and an API key (AiModelConfig). */
  @input
  useLiveAiCompiler: boolean = true;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private internetModule: any = null;
  private listening: boolean = false;
  private currentPresetIndex: number = 0;
  private currentBlueprint: UniversalDishBlueprint = getPreset(0);
  private requestSeq: number = 0;
  private applySeq: number = 0;
  /** P5: seconds between DISH_ITEM_READY events of a staged dish (one item per staging tick). */
  public stagingTickSec: number = 0.12;
  private stage: StageState | null = null;
  private lastEmitted: { bp: UniversalDishBlueprint; presetIndex: number } = { bp: getPreset(0), presetIndex: 0 };

  onAwake(): void {
    try {
      this.internetModule = require("LensStudio:InternetModule");
    } catch (_e) {
      this.internetModule = null;
    }
    // Hand the page-table synthesizer its HTTP/timer hook (it stays offline unless the synthesizer job is configured).
    AssetPageTable.setRuntime({
      internetModule: this.internetModule,
      delay: (seconds: number, cb: () => void) => {
        const ev = this.createEvent("DelayedCallbackEvent") as any;
        ev.bind(cb);
        ev.reset(seconds);
      },
    });
    this.createEvent("OnStartEvent").bind(() => this.initListeners());
  }

  private initListeners(): void {
    if (this.listening) return;
    this.listening = true;
    this.eventBus.on("DISH_COMPILE_REQUESTED", (d?: DishCompileRequestedPayload) => this.requestCompile(d));
    this.eventBus.on("RESET_REQUESTED", () => this.resetToDefault());
  }

  // ── public API ──

  /** Index (0..5) of the active preset, or -1 while a live-compiled dish is active. */
  public getCurrentPresetIndex(): number {
    return this.currentPresetIndex;
  }

  /** Deep copy of the blueprint currently applied (boot = preset 0). */
  public getCurrentBlueprint(): UniversalDishBlueprint {
    return JSON.parse(JSON.stringify(this.currentBlueprint));
  }

  /** Auto Cook: put a dish back right after its own clean-slate Reset (no briefing). Supersedes the preset-0 reset apply. */
  public restoreDish(bp: UniversalDishBlueprint, presetIndex: number): void {
    this.requestSeq++;
    this.currentPresetIndex = presetIndex;
    print(`[RecipeCompiler] restore ${bp.dishId} after Auto Cook reset`);
    void this.applyBlueprint(bp, false);
  }

  /** Handles a compile request. Preset hits apply synchronously; novel dishes may go live. Never throws. */
  public requestCompile(req?: DishCompileRequestedPayload): void {
    try {
      this.requestSeq++;
      const seq = this.requestSeq;
      const query = req && typeof req.query === "string" ? req.query.trim() : "";
      const source = req && req.source ? req.source : "LEAF";

      let idx = -1;
      if (req && typeof req.presetIndex === "number" && isFinite(req.presetIndex)) {
        idx = this.wrapIndex(req.presetIndex);
      } else if (query.length > 0) {
        idx = matchByKeyword(query);
      } else {
        idx = nextPresetIndex(this.currentPresetIndex < 0 ? 0 : this.currentPresetIndex);
      }

      if (idx >= 0) {
        this.applyPreset(idx, "preset");
        return;
      }

      // Unknown dish text: live compiler if configured, otherwise DISH_NOT_FOUND (never a silent other dish).
      if (this.useLiveAiCompiler && isLiveEnabled("compiler") && this.internetModule) {
        print(`[RecipeCompiler] live compile requested (${source}): "${query}"`);
        this.compileLive(query, seq);
        return;
      }
      print(`[RecipeCompiler] no preset match for "${query}", live compiler disabled -> DISH_NOT_FOUND`);
      this.emitNotFound(query, NOT_FOUND_MESSAGE);
    } catch (e) {
      print(`[RecipeCompiler] request error: ${e}`);
    }
  }

  /**
   * Applies a validated blueprint: runs AssetPageTable.batchLoad (Loader A + B in parallel), drives the registered
   * IDishAssetBuilder hooks (no-op by default, so the salmon scene is unchanged), then emits DISH_BLUEPRINT_APPLIED
   * with the real cache hit / page fault counts. A newer apply or Reset supersedes an in-flight one. Never rejects.
   */
  public async applyBlueprint(bp: UniversalDishBlueprint, showBriefing: boolean = true): Promise<void> {
    const my = ++this.applySeq;
    try {
      this.currentBlueprint = JSON.parse(JSON.stringify(bp));
      this.stage = null;
      const load = await AssetPageTable.batchLoad(bp);
      if (my !== this.applySeq) {
        print("[RecipeCompiler] apply superseded before emit");
        return;
      }
      this.lastEmitted = { bp: JSON.parse(JSON.stringify(bp)), presetIndex: this.currentPresetIndex };
      if (showBriefing) {
        // P5 staged path: builder hooks are deferred to the one-by-one reveal after the briefing cards.
        const st = this.buildStage(bp, load);
        this.stage = st;
        const b = DishAssetBuilders.get();
        if (b.stage) this.safe(() => b.stage!(bp, st.items));
        this.eventBus.emit("DISH_BLUEPRINT_APPLIED", {
          blueprint: bp,
          cacheHits: load.cacheHits,
          pageFaults: load.pageFaults,
          showBriefing: true,
          statusLine: load.statusLine,
          staged: true,
        });
        this.eventBus.emit("DISH_LOAD_STAGED", {
          dishId: bp.dishId,
          cacheHits: load.cacheHits,
          pageFaults: load.pageFaults,
          statusLine: load.statusLine,
          total: st.items.length,
          items: st.items,
        });
        print(`[RecipeCompiler] staged ${bp.dishId}: ${st.items.length} items (hits ${load.cacheHits}, faults ${load.pageFaults}) ${load.statusLine}`);
        this.emitReadySequential(st, my);
        return;
      }
      this.runBuilderHooks(bp, load);
      this.eventBus.emit("DISH_BLUEPRINT_APPLIED", {
        blueprint: bp,
        cacheHits: load.cacheHits,
        pageFaults: load.pageFaults,
        showBriefing: false,
        statusLine: load.statusLine,
      });
      print(`[RecipeCompiler] applied ${bp.dishId} (hits ${load.cacheHits}, faults ${load.pageFaults}, briefing false) ${load.statusLine}`);
    } catch (e) {
      print(`[RecipeCompiler] apply error: ${e}`);
    }
  }

  // ── P5 staged load + reveal ──

  /** Items of the staged dish (load order), or [] when nothing is staged. */
  public getStagedItems(): StagedDishItem[] {
    return this.stage ? this.stage.items : [];
  }

  public getStagedDishId(): string {
    return this.stage ? this.stage.dishId : "";
  }

  public isItemReady(itemKey: string): boolean {
    if (!this.stage) return false;
    const i = this.stage.indexOf[itemKey];
    return typeof i === "number" && this.stage.ready[i];
  }

  /**
   * Reveal of one staged item: applies its deferred builder hooks (cut grid, protein tint, vessel morph, sauce colours)
   * and the builder's optional reveal(); returns the objects to pop in. Idempotent; [] when the item is unknown.
   */
  public revealItem(itemKey: string): SceneObject[] {
    const st = this.stage;
    if (!st || st.revealed[itemKey]) return [];
    const i = st.indexOf[itemKey];
    if (typeof i !== "number") return [];
    st.revealed[itemKey] = true;
    const fn = st.apply[itemKey];
    if (fn) this.safe(fn);
    const out: SceneObject[] = (st.items[i].targets || []).slice();
    const b = DishAssetBuilders.get();
    if (b.reveal) {
      this.safe(() => {
        const extra = b.reveal!(itemKey);
        if (extra) for (const o of extra) if (o && out.indexOf(o) < 0) out.push(o);
      });
    }
    return out;
  }

  /** Dish Studio Back / Cancel while identifying: drops any in-flight compile or staging, keeps the live dish. */
  public cancelPending(): void {
    this.requestSeq++;
    this.applySeq++;
    this.stage = null;
    this.currentBlueprint = JSON.parse(JSON.stringify(this.lastEmitted.bp));
    this.currentPresetIndex = this.lastEmitted.presetIndex;
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      print(`[RecipeCompiler] builder hook error: ${e}`);
    }
  }

  private delay(seconds: number, cb: () => void): void {
    const ev = this.createEvent("DelayedCallbackEvent") as any;
    ev.bind(cb);
    ev.reset(seconds);
  }

  /** One DISH_ITEM_READY per item in load order; the page tables resolve at once, so items arrive one per staging tick. */
  private emitReadySequential(st: StageState, my: number): void {
    let i = 0;
    const tick = () => {
      if (my !== this.applySeq || this.stage !== st || i >= st.items.length) return;
      st.ready[i] = true;
      this.eventBus.emit("DISH_ITEM_READY", { dishId: st.dishId, itemKey: st.items[i].key, index: i, total: st.items.length });
      i++;
      if (i < st.items.length) this.delay(Math.max(0.01, this.stagingTickSec), tick);
    };
    this.delay(Math.max(0.01, this.stagingTickSec), tick);
  }

  /** Load order: ingredients (veg lanes, pantry) -> starch / protein -> vessels & tools -> service ware. */
  private buildStage(bp: UniversalDishBlueprint, load: BatchLoadResult): StageState {
    const b = DishAssetBuilders.get();
    const items: StagedDishItem[] = [];
    const apply: { [k: string]: () => void } = {};
    const add = (it: StagedDishItem, fn?: () => void) => {
      if (apply[it.key] !== undefined || items.some((x) => x.key === it.key)) return;
      items.push(it);
      if (fn) apply[it.key] = fn;
    };
    // loading-chip label: the part before "&", "/" or "(", cut at a word boundary (e.g. "RAMEN / HAKKA NOODLES" -> "RAMEN")
    const short = (s: string) => {
      let u = String(s || "").toUpperCase().split(/[&/(,]/)[0].trim();
      if (u.length > 13) {
        const sp = u.lastIndexOf(" ", 13);
        u = sp > 2 ? u.substring(0, sp) : u.substring(0, 13);
      }
      return u.length > 0 ? u : "ITEM";
    };
    for (let i = 0; i < load.ingredients.length; i++) {
      const e = load.ingredients[i];
      add({ key: `veg_${i}`, label: short(e.name), group: "INGREDIENT", accessNumber: e.accessNumber, lane: i, propName: "" }, () => {
        b.rebuildVegSlot(i, e);
        if (i === 0) b.setCutGrid(bp.cutSpacingCm, bp.cutAngleDeg);
      });
    }
    for (const e of load.spices) add({ key: `pantry_${e.accessNumber}`, label: short(e.name), group: "SPICE", accessNumber: e.accessNumber, lane: -1, propName: "" });
    for (const e of load.starches) add({ key: `starch_${e.accessNumber}`, label: short(e.name), group: "STARCH", accessNumber: e.accessNumber, lane: -1, propName: "" });
    add({ key: "protein", label: short(load.protein.spec ? load.protein.spec.name : "PROTEIN"), group: "PROTEIN", accessNumber: load.protein.accessNumber, lane: -1, propName: "SalmonFillet" }, () => b.rebuildProtein(load.protein.spec));

    let primary = -1;
    let secondary = -1;
    for (const v of load.vessels) {
      if (v.kind === "COOKWARE" && v.slot === "SLOT_PRIMARY_BURNER" && primary < 0) primary = v.accessNumber;
      if (v.kind === "COOKWARE" && v.slot === "SLOT_SECONDARY_BURNER" && (secondary < 0 || v.accessNumber === bp.sauce.vesselAccessNumber)) secondary = v.accessNumber;
    }
    let sauceDone = false;
    const order: VesselKind[] = ["COOKWARE", "PREPWARE", "TOOL", "SERVEWARE"];
    for (const kind of order) {
      for (const v of load.vessels) {
        if (v.kind !== kind) continue;
        const n = v.accessNumber;
        const label = SHORT_WARE[n] || short(v.name);
        const group: StagedItemGroup = kind === "SERVEWARE" ? "SERVEWARE" : kind === "TOOL" ? "TOOL" : "VESSEL";
        const key = (kind === "SERVEWARE" ? "serve_" : kind === "TOOL" ? "tool_" : "vessel_") + n;
        let fn: (() => void) | undefined;
        if (kind === "COOKWARE") {
          if (n === primary) fn = () => b.morphVessel("SLOT_PRIMARY_BURNER", n);
          else if (n === secondary) {
            sauceDone = true;
            fn = () => {
              b.morphVessel("SLOT_SECONDARY_BURNER", n);
              b.setSauceColors(bp.sauce.baseLiquidRgb, bp.sauce.reducedSauceRgb);
            };
          }
        } else {
          const on = n === 332 ? bp.sauce.useLadleStir : true;
          fn = () => b.enableTool(n, on);
        }
        add({ key: key, label: label, group: group, accessNumber: n, lane: -1, propName: v.propName }, fn);
      }
    }
    if (!sauceDone && items.length > 0) {
      const last = items[items.length - 1].key;
      const prev = apply[last];
      apply[last] = () => {
        if (prev) prev();
        b.setSauceColors(bp.sauce.baseLiquidRgb, bp.sauce.reducedSauceRgb);
      };
    }
    const indexOf: { [k: string]: number } = {};
    for (let i = 0; i < items.length; i++) indexOf[items[i].key] = i;
    return { dishId: bp.dishId, items: items, apply: apply, ready: items.map(() => false), revealed: {}, indexOf: indexOf };
  }

  /** Page-table results -> builder hooks. Each hook is isolated so one failing builder call cannot block the emit. */
  private runBuilderHooks(bp: UniversalDishBlueprint, load: BatchLoadResult): void {
    const b = DishAssetBuilders.get();
    const safe = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        print(`[RecipeCompiler] builder hook error: ${e}`);
      }
    };
    for (let i = 0; i < load.ingredients.length; i++) safe(() => b.rebuildVegSlot(i, load.ingredients[i]));
    if (b.rebuildStarch) {
      // A2: previous starch props leave, this dish's starches rest raw (stage 0) at SLOT_STARCH (none for dish 01)
      const tint = { baseRgb: bp.sauce.baseLiquidRgb, reducedRgb: bp.sauce.reducedSauceRgb };
      safe(() => b.rebuildStarch!(null));
      for (const e of load.starches) safe(() => b.rebuildStarch!(e, 0, tint));
    }
    if (b.rebuildPantry) {
      // A5: pantry props of this dish (none for dish 01); the previous dish's leave first
      const names: string[] = [bp.dishTitle, bp.cuisineTag, bp.protein ? bp.protein.name : ""];
      for (const e of load.ingredients) names.push(e ? e.name : "");
      const vessels = load.vessels.map((v) => v.accessNumber);
      safe(() => b.rebuildPantry!(load.spices.length > 0 ? load.spices : null, { dishText: names.join(" ").toLowerCase(), vessels: vessels }));
    }
    safe(() => b.rebuildProtein(load.protein.spec));
    let primary = -1;
    let secondary = -1;
    for (let i = 0; i < load.vessels.length; i++) {
      const v = load.vessels[i];
      if (v.kind === "COOKWARE" && v.slot === "SLOT_PRIMARY_BURNER") primary = v.accessNumber;
      if (v.kind === "COOKWARE" && v.slot === "SLOT_SECONDARY_BURNER" && (secondary < 0 || v.accessNumber === bp.sauce.vesselAccessNumber)) secondary = v.accessNumber;
    }
    if (primary >= 0) safe(() => b.morphVessel("SLOT_PRIMARY_BURNER", primary));
    if (secondary >= 0) safe(() => b.morphVessel("SLOT_SECONDARY_BURNER", secondary));
    for (let i = 0; i < load.vessels.length; i++) {
      const v = load.vessels[i];
      if (v.kind === "COOKWARE") continue;
      const on = v.accessNumber === 332 ? bp.sauce.useLadleStir : true;
      safe(() => b.enableTool(v.accessNumber, on));
    }
    safe(() => b.setCutGrid(bp.cutSpacingCm, bp.cutAngleDeg));
    safe(() => b.setSauceColors(bp.sauce.baseLiquidRgb, bp.sauce.reducedSauceRgb));
  }

  // ── internals ──

  private wrapIndex(i: number): number {
    const n = Math.floor(i);
    return ((n % PRESET_COUNT) + PRESET_COUNT) % PRESET_COUNT;
  }

  private applyPreset(idx: number, how: string): void {
    const gate = ProposalGate.validateDishBlueprint(getPreset(idx));
    if (!gate.ok) {
      // Presets are unit-verified; if one ever fails, keep the boot dish rather than emit garbage.
      print(`[RecipeCompiler] preset ${idx} failed validation (${gate.errors.join("; ")}) -> keeping current dish`);
      return;
    }
    this.currentPresetIndex = idx;
    print(`[RecipeCompiler] ${how} -> preset ${idx} (${gate.sanitized.dishId})`);
    void this.applyBlueprint(gate.sanitized, true);
  }

  private resetToDefault(): void {
    this.requestSeq++; // cancel any in-flight live compile
    this.stage = null; // drop a staged dish that was never revealed
    const b = DishAssetBuilders.get();
    if (b.rebuildStarch) this.safe(() => b.rebuildStarch!(null)); // A2: Reset removes every starch prop (dish 01 has none)
    if (b.rebuildPantry) this.safe(() => b.rebuildPantry!(null)); // A5: Reset removes every pantry prop (dish 01 has none)
    // K1a: always re-apply dish 01 through the normal restore path (builder hooks + leftover settling), so vessels /
    // tools / extras switched on by hand are restored too, not only those of another dish.
    this.applySeq++; // supersede any in-flight page-table apply of another dish
    const gate = ProposalGate.validateDishBlueprint(getPreset(0));
    this.currentPresetIndex = 0;
    void this.applyBlueprint(gate.ok ? gate.sanitized : getPreset(0), false);
  }

  /** Tells the UI the dish could not be identified (it shows the message and reopens the input). Never loads another dish. */
  private emitNotFound(query: string, message: string): void {
    this.eventBus.emit("DISH_NOT_FOUND", { query: query, message: message && message.length > 0 ? message : NOT_FOUND_MESSAGE });
  }

  private async compileLive(query: string, seq: number): Promise<void> {
    let bp: UniversalDishBlueprint | null = null;
    let reason = "";
    let message = NOT_FOUND_MESSAGE;
    try {
      const raw = await this.callAnthropic(query);
      if (ProposalGate.isNotFound(raw)) {
        reason = "model returned found=false";
        message = ProposalGate.notFoundText(raw);
      } else {
        const gate = ProposalGate.validateDishBlueprint(raw);
        if (gate.ok) bp = gate.sanitized;
        else reason = "validation: " + gate.errors.slice(0, 3).join("; ");
      }
    } catch (e) {
      reason = String(e);
    }
    if (seq !== this.requestSeq) {
      print("[RecipeCompiler] live result discarded (superseded by a newer request or reset)");
      return;
    }
    if (bp) {
      this.currentPresetIndex = -1;
      void this.applyBlueprint(bp, true);
      return;
    }
    print(`[RecipeCompiler] live compile gave no dish (${reason}) -> DISH_NOT_FOUND`);
    this.emitNotFound(query, message);
  }

  /** POSTs to the Anthropic Messages API and returns the parsed blueprint object (unvalidated). Throws on any failure. */
  private async callAnthropic(query: string): Promise<any> {
    const body = {
      model: getModel("compiler"),
      max_tokens: COMPILE_MAX_TOKENS,
      system: COMPILER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: "Dish request: " + query }] }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: UniversalDishJsonSchema },
      },
    };

    const timeout = new Promise<never>((_res, rej) => {
      const ev = this.createEvent("DelayedCallbackEvent") as any;
      ev.bind(() => rej(new Error("timeout " + COMPILE_TIMEOUT_MS + "ms")));
      ev.reset(COMPILE_TIMEOUT_MS / 1000);
    });

    const response = await Promise.race([
      this.internetModule.fetch(ENDPOINT_URL, {
        method: "POST",
        headers: {
          "x-api-key": getApiKey(),
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      timeout,
    ]);

    if (!response || response.status !== 200) {
      throw new Error("HTTP " + (response ? response.status : "none"));
    }
    const data = await response.json();
    if (!data || data.stop_reason === "refusal" || data.stop_reason === "max_tokens") {
      throw new Error("stop_reason " + (data ? data.stop_reason : "none"));
    }
    let text = "";
    const blocks = data.content || [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === "text" && typeof blocks[i].text === "string") text += blocks[i].text;
    }
    if (text.length === 0) throw new Error("empty reply");
    try {
      return JSON.parse(text);
    } catch (_e) {
      throw new Error("unparseable JSON");
    }
  }
}
