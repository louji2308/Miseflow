/**
 * IDishAssetBuilder.ts  (v5 Part 2)
 * Hook interface between the compiled dish (page-table results) and whatever builds/morphs the 3D props.
 * Default = NoopDishAssetBuilder (changes nothing, so the existing salmon + beurre-blanc scene is untouched).
 * The asset phase / Part 4 plugs the real StationPropsBuilder implementation in with
 * DishAssetBuilders.register(impl) WITHOUT editing this file.
 */

import { VesselSlotId } from "./SpatialSlotAllocator";
import { PrepSlotEntry, Rgb, UniversalDishBlueprint } from "./UniversalDishSchema";

export type ProteinSpec = UniversalDishBlueprint["protein"];

export type StagedItemGroup = "INGREDIENT" | "SPICE" | "STARCH" | "PROTEIN" | "VESSEL" | "TOOL" | "SERVEWARE";

/**
 * P5 staged load: one item of the dish that is prepared HIDDEN during the briefing cards and popped in at the reveal.
 * key is stable ("veg_0", "pantry_161", "starch_116", "protein", "vessel_303", "tool_332", "serve_343").
 * A builder's stage() may fill `targets` with the scene objects that represent the item (hidden at reveal start,
 * popped one by one); items without targets only show as a READY chip on the loading panel.
 */
export interface StagedDishItem {
  key: string;
  label: string;
  group: StagedItemGroup;
  accessNumber: number;
  /** Lane index for veg items (0..4), otherwise -1. */
  lane: number;
  /** Scene prop name from the page table (vessels/tools), "" for ingredients. */
  propName: string;
  targets?: SceneObject[];
}

/** A2: optional dish colours a starch picks up (rice dum saffron/masala, noodle glaze, pasta sauce). */
export interface StarchTint {
  baseRgb?: Rgb;
  reducedRgb?: Rgb;
}

/** A5: context for the pantry props (variant picking + #326 ramekin integration). */
export interface PantryContext {
  /** lower-case dish text: title, cuisine, protein and ingredient names */
  dishText: string;
  /** vessel + tool access numbers of the dish */
  vessels: number[];
}

export interface IDishAssetBuilder {
  /** Re-mesh prep lane i (0..4) from a resolved page-table entry. */
  rebuildVegSlot(i: number, entry: PrepSlotEntry): void;
  /** Re-mesh the primary protein (skillet/wok) from the resolved spec. */
  rebuildProtein(protein: ProteinSpec): void;
  /** Morph the cookware on a burner slot into the vessel with this access number (#301/#302/#303/#311). */
  morphVessel(slot: VesselSlotId, accessNumber: number): void;
  /** Show/hide a utensil or ware (#321 knife, #323 bowl, #331 spatula, #332 ladle, #341 plate). */
  enableTool(accessNumber: number, enabled: boolean): void;
  /** Cutting-grid laser: spacing 0.4..2.0 cm, angle 0 or 45 degrees. */
  setCutGrid(spacingCm: number, angleDeg: number): void;
  /** Two-pour sauce colours: base liquid (pour 1) and reduced sauce (pour 2). */
  setSauceColors(base: Rgb, reduced: Rgb): void;
  /**
   * P5 (optional, backward compatible): prepare the dish's items HIDDEN while the briefing cards are shown
   * (build meshes disabled, fill item.targets). Nothing visible may change here.
   */
  stage?(bp: UniversalDishBlueprint, items: StagedDishItem[]): void;
  /**
   * P5 (optional): the reveal of one staged item, called right after the legacy hooks for that item were applied.
   * May return extra scene objects to pop in (in addition to item.targets).
   */
  reveal?(itemKey: string): SceneObject[] | void;
  /**
   * A2 (optional, backward compatible): place / re-stage the starch prop of `entry` (#116-#121) at its rest slot in
   * stage 0 raw / 1 par-cooked / 2 finished. entry null removes every starch prop (Reset, dish without starch).
   */
  rebuildStarch?(entry: PrepSlotEntry | null, stage?: 0 | 1 | 2, tint?: StarchTint): void;
  /**
   * A5 (optional, backward compatible): build the dish's spices / dairy / oils / legumes props (#160-#166) at their rest
   * slots. entries null removes every pantry prop (Reset, dish without pantry items). Staged dishes use stage()/reveal()
   * with item keys "pantry_<n>" instead.
   */
  rebuildPantry?(entries: PrepSlotEntry[] | null, ctx?: PantryContext): void;
}

/** Default builder: every hook is a no-op; logs a single line the first time any hook is hit. */
export class NoopDishAssetBuilder implements IDishAssetBuilder {
  private logged: boolean = false;

  private note(): void {
    if (this.logged) return;
    this.logged = true;
    print("[DishAssetBuilder] NoopDishAssetBuilder active (asset phase pending): scene left unchanged");
  }

  rebuildVegSlot(_i: number, _entry: PrepSlotEntry): void { this.note(); }
  rebuildProtein(_protein: ProteinSpec): void { this.note(); }
  morphVessel(_slot: VesselSlotId, _accessNumber: number): void { this.note(); }
  enableTool(_accessNumber: number, _enabled: boolean): void { this.note(); }
  setCutGrid(_spacingCm: number, _angleDeg: number): void { this.note(); }
  setSauceColors(_base: Rgb, _reduced: Rgb): void { this.note(); }
  rebuildStarch(_entry: PrepSlotEntry | null, _stage?: 0 | 1 | 2, _tint?: StarchTint): void {}
  rebuildPantry(_entries: PrepSlotEntry[] | null, _ctx?: PantryContext): void {}
}

let current: IDishAssetBuilder = new NoopDishAssetBuilder();

/** Registry: DishAssetBuilders.register(realBuilder) from the asset phase / Part 4; get() is used by RecipeCompilerService. */
export const DishAssetBuilders = {
  /** Replace the active builder. Passing null restores the no-op default. */
  register(builder: IDishAssetBuilder | null): void {
    current = builder ? builder : new NoopDishAssetBuilder();
  },
  get(): IDishAssetBuilder {
    return current;
  },
};
