/**
 * MiseFlowEventBus.ts
 * MiseFlow AR v3.0 - Typed Decoupled Event Bus for Spatial Kitchen Flow Orchestrator.
 * Connects input triggers, schedule engine, spatial cues, and rehearsal tools.
 */

export type MiseFlowEventType =
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
