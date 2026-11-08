/**
 * CookWorld.ts  (Chef Director v6, the contract between CookStage (builds the scene) and CookRuntime/Actions (animate it))
 *
 * CookStage builds a CookWorld from a validated CookPlan: ONLY the equipment, tools and ingredients the plan lists are
 * created, laid out on a dynamic bench. Actions never search the scene by name; they only talk to these handles.
 * All positions are WORLD space (cm). Handles must stay valid for the whole cook and be safe to call repeatedly.
 */

import { CookPlan } from "./CookPlanSchema";

export type HeatLevel = "OFF" | "LOW" | "MED" | "HIGH";

/** Bus event names (MiseFlowEventBus). Payload shapes in comments. */
export const CookEvents = {
  /** {query:string} request to compose a dish through the Cook engine (sent by RecipeCompilerService for non-presets) */
  PLAN_REQUESTED: "COOK_PLAN_REQUESTED",
  /** {plan:CookPlan} validated plan available (steps can be shown immediately) */
  PLAN_READY: "COOK_PLAN_READY",
  /** {index:number,total:number,label:string} progressive loading of bench items (for the loading panel) */
  LOAD_PROGRESS: "COOK_LOAD_PROGRESS",
  /** {world:CookWorld} stage built and every needed item revealed; cooking may start */
  WORLD_READY: "COOK_WORLD_READY",
  /** {stepId:string,index:number,total:number,action:string,title:string,whatWhy:string,equipmentId:string} */
  STEP_STARTED: "COOK_STEP_STARTED",
  /** {stepId:string,index:number,total:number} */
  STEP_DONE: "COOK_STEP_DONE",
  /** {} every step done and plated */
  FINISHED: "COOK_FINISHED",
  /** {} leave Cook mode, restore the legacy salmon setup (Reset / Back) */
  EXIT: "COOK_EXIT",
} as const;

export interface EquipmentHandle {
  id: string;
  kind: string;                  // EQUIPMENT_KINDS value
  obj: SceneObject;              // root of this vessel (moves with it)
  /** centre of the opening (rim plane) in world space */
  rimWorld(): vec3;
  /** centre of the inside bottom (food rests here) in world space; for BOARD/PLATE the top surface centre */
  floorWorld(): vec3;
  /** inner radius of the opening / usable surface radius, cm */
  radiusCm: number;
  /** burner glow ring + steam rate + oil shimmer follow this */
  setHeat(level: HeatLevel): void;
  /** oil depth 0..1 (0 = none) and bubbling intensity 0..1 */
  setOil(level01: number, bubbling01: number): void;
  /** steam plume intensity 0..1 */
  setSteam(amount01: number): void;
  /** liquid / content fill 0..1 with an RGB tint (batter, sauce, water) */
  setFill(level01: number, color: vec3): void;
}

export interface ToolHandle {
  id: string;
  kind: string;                  // TOOL_KINDS value
  obj: SceneObject;              // tool root; actions move/rotate this transform
  /** rest pose (where the tool lies when idle) in world space */
  restPos: vec3;
  restRot: quat;
  /** the working tip (blade end, pin centre, spoon bowl) as a LOCAL offset from obj origin */
  tipLocal: vec3;
}

export interface ItemHandle {
  id: string;
  name: string;
  role: string;                  // INGREDIENT_ROLES value
  obj: SceneObject;              // root; pieces are children
  /** individual pieces (e.g. 14 chicken chunks) so actions can drop/toss/batch them */
  pieces: SceneObject[];
  /** where it sits on the bench initially (world) */
  homePos: vec3;
  /** repaint every piece/material: colour (linear 0..1, already lifted for the additive display), roughness 0..1, emissive 0..1 */
  paint(color: vec3, rough01: number, emissive01: number): void;
  setVisible(on: boolean): void;
  /** scale the whole item (dough disc growing under a rolling pin, dough ball shrinking) */
  setScale(s: vec3): void;
  /** current shape form of a vegetable ("whole" | "cut" | "paste"); undefined for items without forms */
  form?: string;
  /** swap the shown form; false when the item has no such form */
  setForm?(form: string): boolean;
  hasForm?(form: string): boolean;
}

export interface CookWorld {
  plan: CookPlan;
  root: SceneObject;
  equipment: { [id: string]: EquipmentHandle };
  tools: { [id: string]: ToolHandle };
  items: { [id: string]: ItemHandle };
  /** plate handle (also in `equipment`) */
  plate: EquipmentHandle;
  /** world position inside the plate where finished food is placed */
  platingSpot(): vec3;
  /** destroy everything created and restore nothing else; the legacy setup is restored by the Exit event */
  dispose(): void;
}
