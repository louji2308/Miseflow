import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { getPreset } from "./AI/DishLibraryConfig";
import { UniversalDishBlueprint } from "./AI/UniversalDishSchema";

/**
 * DishBlueprintApplier.ts (v5 Part 4, WS16)
 * Owns "which dish is live" for the runtime. On DISH_BLUEPRINT_APPLIED it re-times / re-titles the
 * ChoreographyDAG (ChoreographyDAG.applyDishBlueprint keeps the four task keys) and publishes the
 * active blueprint to the kinematics (KINE_PAN_TOSS_ROLL, KINE_LADLE_ORBITAL_STIR) and Auto Cook.
 * The IDishAssetBuilder hooks (StationPropsDishBuilder) are already driven by RecipeCompilerService
 * right before it emits DISH_BLUEPRINT_APPLIED, so they are not called a second time here.
 * Boot / Btn_Reset = preset 0 (01_salmon_beurre_blanc).
 */
@component
export class DishBlueprintApplier extends BaseScriptComponent {
  private static active: UniversalDishBlueprint = getPreset(0);

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private dag: ChoreographyDAG | null = null;

  /** The blueprint currently driving the kitchen (read-only use; boot = preset 0). */
  public static getActiveBlueprint(): UniversalDishBlueprint {
    return DishBlueprintApplier.active;
  }

  public static isDefaultDish(): boolean {
    return DishBlueprintApplier.active.dishId === getPreset(0).dishId;
  }

  /** Active dish asks for KINE_PAN_TOSS_ROLL instead of the spatula flip. */
  public static wantsPanToss(): boolean {
    const p = DishBlueprintApplier.active.protein;
    return !!p && p.primaryKine === "KINE_PAN_TOSS_ROLL";
  }

  /** Active dish asks for the #332 ladle orbital stir after pour 2. */
  public static wantsLadleStir(): boolean {
    const s = DishBlueprintApplier.active.sauce;
    return !!s && s.useLadleStir === true;
  }

  onAwake(): void {
    DishBlueprintApplier.active = getPreset(0);
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveDag();
      this.listen("DISH_BLUEPRINT_APPLIED", (d?: any) => this.onApplied(d));
      this.listen("RESET_REQUESTED", () => {
        // RecipeCompilerService re-applies preset 0 (and its DAG timing) when another dish was live
        DishBlueprintApplier.active = getPreset(0);
      });
    });
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[DishApplier] ${ev} handler error: ${e}`);
      }
    };
    this.eventBus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }

  private resolveDag(): void {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    if (o) this.dag = o.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
  }

  private onApplied(d?: any): void {
    if (!d || !d.blueprint) return;
    const bp = d.blueprint as UniversalDishBlueprint;
    DishBlueprintApplier.active = JSON.parse(JSON.stringify(bp));
    if (!this.dag) this.resolveDag();
    if (this.dag) this.dag.applyDishBlueprint(bp);
    print(`[DishApplier] ${bp.dishId}: kine ${bp.protein ? bp.protein.primaryKine : "?"}, ladle ${bp.sauce ? bp.sauce.useLadleStir : false}`);
  }
}
