/**
 * MiseFlowEventBus.ts
 * MiseFlow AR v3.0 - Typed Decoupled Event Bus for Spatial Kitchen Flow Orchestrator.
 * Connects input triggers, schedule engine, spatial cues, and rehearsal tools.
 */

export type MiseFlowEventType =
  | "COOK_PLAN_REQUESTED"
  | "COOK_PLAN_READY"
  | "COOK_LOAD_PROGRESS"
  | "COOK_WORLD_READY"
  | "COOK_STEP_STARTED"
  | "COOK_STEP_DONE"
  | "COOK_FINISHED"
  | "COOK_EXIT"
  | "COOK_DO_STEP"
  | "COOK_AUTO"
  | "COOK_NEW_DISH"
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "DRIFT_RECORDED"
  | "HOLD_CONFIRMED"
  | "SCHEDULE_REVISED"
  | "VOLUME_DOME_UPDATED"
  | "CUT_REFERENCE_STEP"
  | "VISUAL_BROWNING_CHECK"
  | "RESET_REQUESTED"
  | "TIME_WARP_TOGGLED"
  | "PLATING_CONVERGENCE"
  | "TRIGGER_AI_VISION_PROBE"
  | "AI_VISION_STATE_CHANGED"
  // WS9 prep visuals (StationPropsBuilder): hook points for Auto Cook / plating
  | "PREP_VEG_STATE_CHANGED"
  | "PREP_BOWL_FILLED"
  // WS9-P2 physical salmon flip (SpatulaTechniqueGuide / SpatulaFlipRig): payload { durationSec }
  | "SALMON_FLIP_STARTED"
  | "SALMON_FLIPPED"
  // WS9-P3: bowl tipped into the saucier; plating tween start/end; Auto Cook state { running, caption, stage }
  | "PREP_BOWL_POURED"
  | "PLATING_STARTED"
  | "DISH_PLATED"
  | "AUTO_COOK_STATE"
  // v5 universal dish compiler / briefing deck / chef coach / kinematic triggers (payloads below)
  | "DISH_COMPILE_REQUESTED"   // DishCompileRequestedPayload
  | "DISH_BLUEPRINT_APPLIED"   // DishBlueprintAppliedPayload
  | "BRIEFING_CARD_CHANGED"    // BriefingCardChangedPayload
  | "BRIEFING_COMPLETED"       // BriefingCompletedPayload
  | "CHEF_COACH_SPEAK"         // ChefCoachSpeakPayload
  | "LADLE_STIR_REQUESTED"     // LadleStirRequestedPayload
  | "PAN_TOSS_REQUESTED"       // PanTossRequestedPayload
  // v5 D1: more kinematic triggers, dish-not-found, staged load / reveal, per-dish step engine
  | "NOODLE_TOSS_REQUESTED"    // NoodleTossRequestedPayload
  | "DUM_SEAL_REQUESTED"       // DumSealRequestedPayload
  | "WHISK_REQUESTED"          // WhiskRequestedPayload
  | "DISH_NOT_FOUND"           // DishNotFoundPayload
  | "DISH_LOAD_STAGED"         // DishLoadStagedPayload (props built HIDDEN, waiting for the reveal)
  | "DISH_REVEALED"            // DishRevealedPayload (old props leave, all new props pop in)
  | "DISH_ITEM_READY"          // DishItemReadyPayload (one staged item finished loading; used later for the one-by-one reveal)
  | "STUDIO_TEXT_SUBMITTED"    // StudioTextSubmittedPayload (P5 Dish Studio: transcript / typed text ready for review)
  | "STUDIO_STATE_CHANGED"     // StudioStateChangedPayload (P5 Dish Studio mode / screen)
  | "STEP_STARTED"             // DishStepPayload
  | "STEP_COMPLETED"           // DishStepPayload
  | "KINEMATIC_COMPLETED"      // v5 K1b { kinematic, phase, durationSec } (noodle toss / dum / whisk finished)
  // v7 S1 kitchen anchor root (KitchenAnchorRoot)
  | "KITCHEN_ROOT_READY"       // KitchenRootReadyPayload (StationsRoot adopted under KitchenAnchorRoot, first frame)
  | "KITCHEN_POSE_CHANGED"     // KitchenPoseChangedPayload (setPose / resetPose accepted)
  | "KITCHEN_SLAB_MODE_CHANGED" // KitchenSlabModeChangedPayload
  // v7 Stage 2 claim and memory (ClaimController / KitchenPersistence / KitchenAnchorRoot)
  | "STATION_CLAIMED"          // StationClaimedPayload (one spot accepted)
  | "STATION_UNCLAIMED"        // StationUnclaimedPayload (undo of the last spot)
  | "KITCHEN_CLAIMED"          // KitchenClaimedPayload (4th spot accepted: kitchen posed, Station_* built)
  | "CLAIM_STATE_CHANGED"      // ClaimStateChangedPayload (begin / cancel / next role / complete)
  | "KITCHEN_RECALLED"         // KitchenRecalledPayload (remembered kitchen applied at boot, no claim UI)
  | "KITCHEN_FORGOTTEN"        // KitchenForgottenPayload (store / anchor area cleared)
  | "KITCHEN_CONTENT_HIDDEN"   // KitchenContentHiddenPayload (KitchenAnchorRoot.setContentHidden)
  // v7 Plan E3 (reserved: names only, not emitted yet)
  | "HAND_AT_STATION"
  | "HAND_LEFT_STATION"
  | "STEP_DONE_PINCHED"
  | "TASK_LATE"
  | "PUCK_DISPLACED"
  | "HEAT_GUARD"
  | "ALERT_RAISED"
  | "ALERT_RESOLVED"
  | "REPLAN_REQUESTED"
  | "OPEN_DISH_STUDIO"
  | "PALETTE_REQUESTED"
  // Legacy aliases for backward compatibility with SIK interactables
  | "STATION_STEP_COMPLETED"
  | "DAG_HOLD_TOGGLED"
  | "GHOST_MODE_CHANGED"
  | "MAILLARD_VISION_RESULT"
  | "ACOUSTIC_CHOP_DETECTED";

export interface TaskLifecyclePayload {
  taskId: string;
  stationId: "PREP" | "SKILLET" | "SAUCEPOT" | "PLATING";
  timestamp?: number;
  triggerSource?: "SIK" | "VOICE" | "MANUAL" | "REHEARSAL";
}

export interface DriftRecordedPayload {
  taskId: string;
  deltaSeconds: number;
  reason: string;
}

export interface HoldConfirmedPayload {
  stationId: "PREP" | "SKILLET" | "SAUCEPOT";
  isHeld: boolean;
  acknowledgedByUser: boolean;
  notes?: string;
}

export interface ScheduleRevisedPayload {
  affectedTasks: string[];
  revisedFinishDeltaSeconds: number;
  explanation: string;
  recommendedAction: string;
}

export interface VolumeDomePayload {
  fillRatio: number;
  referenceVolumeCm3: number;
  isComplete: boolean;
  // Legacy field
  gramsEstimated?: number;
}

export interface CutReferencePayload {
  sliceIndex: number;
  totalSlices: number;
  spacingCm: number;
}

export interface VisualBrowningPayload {
  stationId: string;
  status: "IN_PROGRESS" | "CRUST_DEVELOPED";
  advisoryMessage: string;
  requiresUserConfirmation: boolean;
  // Legacy fields
  deltaSeconds?: number;
  badgeText?: string;
}

export interface TimeWarpPayload {
  multiplier: number;
  isDemoMode: boolean;
}

// -- v5 payloads --
export interface DishCompileRequestedPayload {
  query?: string;       // free text / voice phrase; matched to a preset or sent to the live compiler
  presetIndex?: number; // explicit preset (0..5); wins over query
  source: "HUD" | "VOICE" | "LEAF" | "KEYBOARD";
}

/** P5: text for the Dish Studio review card. SPEECH shows "Heard" (+ Edit), KEYBOARD shows "Typed" (no edit step). */
export interface StudioTextSubmittedPayload {
  text: string;
  source: "SPEECH" | "KEYBOARD";
}

export interface StudioStateChangedPayload {
  open: boolean;
  screen: string;       // CLOSED | HOME | LISTENING | TYPING | REVIEW | IDENTIFYING | DECK
}

export interface DishBlueprintAppliedPayload {
  blueprint: any;       // UniversalDishBlueprint (typed any to keep the bus free of AI imports)
  cacheHits: number;
  pageFaults: number;
  showBriefing: boolean;
  statusLine?: string;  // AssetPageTable batch status line (Briefing Deck DMA row)
  staged?: boolean;     // P5: builder hooks deferred to the one-by-one reveal (DISH_LOAD_STAGED follows)
}

export interface BriefingCardChangedPayload {
  cardIndex: number;
  totalCards: number;
  stationFocus: string; // "PREP" | "SKILLET" | "SAUCEPOT" | "PLATING"
}

export interface BriefingCompletedPayload {
  dishId: string;
  skipped: boolean;
}

export interface ChefCoachSpeakPayload {
  text: string;
  category: "PREP" | "SEAR" | "SAUCE" | "DRIFT" | "VISION";
}

export interface LadleStirRequestedPayload {
  revolutions?: number;
}

export interface PanTossRequestedPayload {
  hops?: number;
}

export interface NoodleTossRequestedPayload {
  lifts?: number;
}

export interface DumSealRequestedPayload {
  seal?: boolean;       // true = seal the domed lid, false = lift it (steam release)
}

export interface WhiskRequestedPayload {
  strokes?: number;
}

/** Offline matcher and/or live compiler could not identify the dish: UI shows message and reopens the input. */
export interface DishNotFoundPayload {
  query: string;
  message: string;      // default "Dish not found. Enter the correct dish name."
}

export interface DishLoadStagedPayload {
  dishId: string;
  cacheHits: number;
  pageFaults: number;
  statusLine: string;
  total?: number;       // P5: number of staged items (DISH_ITEM_READY follows once per item, in load order)
  items?: any[];        // P5: StagedDishItem[] (typed any to keep the bus free of AI imports)
}

export interface DishRevealedPayload {
  dishId: string;
}

export interface DishItemReadyPayload {
  dishId: string;
  itemKey: string;      // stable key of the staged item, e.g. "veg_0", "starch_116", "protein", "vessel_303", "tool_332"
  index: number;        // 0-based position in the load order
  total: number;        // number of items the dish stages
}

export interface DishStepPayload {
  dishId: string;
  stepId: string;
  index: number;        // 0-based position in blueprint.steps
  total: number;
}

// -- v7 payloads --
/** Kitchen slab visibility: SOLID (as authored), FAINT (cloned, dimmed material), HIDDEN (RMV disabled, object kept). */
export type SlabMode = "SOLID" | "FAINT" | "HIDDEN";
/** Who set the kitchen pose: the P0 default, a Stage 2 counter claim, a recalled anchor, or a LEAF scenario. */
export type KitchenPoseSource = "DEFAULT" | "CLAIM" | "RECALL" | "LEAF";

export interface KitchenRootReadyPayload {
  rootName: string;     // "KitchenAnchorRoot"
  adopted: string[];    // e.g. ["StationsRoot"]
}

export interface KitchenPoseChangedPayload {
  position: vec3;       // KitchenAnchorRoot world position (counter plane origin)
  rotation: quat;       // yaw-only world rotation
  source: KitchenPoseSource;
}

export interface KitchenSlabModeChangedPayload {
  mode: SlabMode;
}

// -- v7 Stage 2 payloads (claim and memory) --
/** Claimable spots, in claim order. WARM is a fifth spot offered only on demand (ClaimController.requestWarmSpot). */
export type StationRole = "BURNER_L" | "BURNER_R" | "BOARD" | "PLATE" | "WARM";
/** How the claim surface was found: the world mesh, or the Lens-provided virtual counter plane. */
export type ClaimSurfaceMode = "MESH" | "PLANE";

export interface StationClaimedPayload {
  role: StationRole;
  position: vec3;       // world position on the surface (cm)
  normal: vec3;         // world surface normal (unit)
  index: number;        // 0-based claim index
  total: number;        // spots needed for this claim pass (4, or 5 with a warm spot)
  surface: ClaimSurfaceMode;
}

export interface StationUnclaimedPayload {
  role: StationRole;
  remaining: number;    // spots still claimed after the undo
}

export interface ClaimedStationInfo {
  role: StationRole;
  name: string;         // Station_BurnerL / Station_BurnerR / Station_Board / Station_Plate / Station_Warm
  position: vec3;       // world
  localPosition: vec3;  // KitchenAnchorRoot local
  normal: vec3;         // world
}

export interface KitchenClaimedPayload {
  stations: ClaimedStationInfo[];
  rootPosition: vec3;   // KitchenAnchorRoot world position (surface height)
  rootRotation: quat;   // yaw-only; local +X runs from the left burner toward the plate
  surface: ClaimSurfaceMode;
  warmOnly?: boolean;   // true for a requestWarmSpot() pass (kitchen pose unchanged, Station_Warm only)
}

export interface ClaimStateChangedPayload {
  claiming: boolean;
  nextRole: StationRole | null;
  claimed: number;
  total: number;
  reason: "BEGIN" | "CLAIM" | "UNDO" | "CANCEL" | "COMPLETE" | "WARM";
}

/** One remembered pose (world). role "KITCHEN" is the KitchenAnchorRoot pose itself. */
export interface StationPose {
  role: StationRole | "KITCHEN";
  position: vec3;
  rotation: quat;
  transform: mat4;
  anchorId?: string;    // device only (Spatial Anchors)
}

export interface KitchenRecalledPayload {
  stations: StationPose[];
  source: "STORAGE" | "ANCHORS";
}

export interface KitchenForgottenPayload {
  source: "STORAGE" | "ANCHORS";
}

export interface KitchenContentHiddenPayload {
  hidden: boolean;
}

type EventCallback = (data?: any) => void;

export class MiseFlowEventBus {
  private static instance: MiseFlowEventBus;
  private listeners: Map<MiseFlowEventType, EventCallback[]> = new Map();

  public static getInstance(): MiseFlowEventBus {
    if (!MiseFlowEventBus.instance) {
      MiseFlowEventBus.instance = new MiseFlowEventBus();
    }
    return MiseFlowEventBus.instance;
  }

  public on(event: MiseFlowEventType, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: MiseFlowEventType, callback: EventCallback): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const index = list.indexOf(callback);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  public emit(event: MiseFlowEventType, data?: any): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (e) {
          print(`[MiseFlowEventBus] Error in listener for ${event}: ${e}`);
        }
      }
    }
  }

  public clearAllListeners(): void {
    this.listeners.clear();
  }
}
