import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { makePbrMaterial } from "./StationPropsBuilder";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

/**
 * ConcentricThermalRing.ts (StationStatusRing in v3)
 * Provides calm, glanceable visual status rings for cooking stations:
 * - Ready / Standby: Teal (Mat_CryoCyan)
 * - Active Cooking: Amber Gold (Mat_MaillardGold)
 * - Drift Alert / Needs Attention: Coral (Mat_PyroCoral)
 * - Hold Acknowledged: Muted Violet (Mat_HoldViolet)
 */
@component
export class ConcentricThermalRing extends BaseScriptComponent {
  @input
  stationId: string = "SKILLET"; // "SKILLET" or "SAUCEPOT"

  @input
  middleRingObject?: SceneObject;

  @input
  innerTargetObject?: SceneObject;

  @input
  dagController?: ChoreographyDAG;

  @input
  matReady?: Material;

  @input
  matActive?: Material;

  @input
  matAlert?: Material;

  @input
  matHold?: Material;

  private matComplete?: Material;
  private matBlueUpcoming?: Material;
  private matAmberActive?: Material;
  private matCoralAlert?: Material;

  private isHeld: boolean = false;
  private isPlated: boolean = false;
  private isDriftAlert: boolean = false;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      this.initListeners();
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private loadMat(relPath: string): Material | undefined {
    try {
      return requireAsset(relPath) as Material;
    } catch (_e) {
      return undefined;
    }
  }

  private resolveReferences(): void {
    const selfObj = this.getSceneObject();
    if (!this.dagController) {
      this.dagController = selfObj.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    }
    if (!this.middleRingObject) {
      const ringName = this.stationId === "SKILLET" ? "MiddleRing" : "PotSimmerRing";
      this.middleRingObject = findByName(selfObj, ringName);
    }
    if (!this.innerTargetObject && this.stationId === "SKILLET") {
      this.innerTargetObject = findByName(selfObj, "InnerTarget");
    }

    this.matAmberActive = makePbrMaterial(0.98, 0.68, 0.22, 0.1, 0.25);
    this.matBlueUpcoming = makePbrMaterial(0.32, 0.68, 0.98, 0.1, 0.25);
    this.matCoralAlert = makePbrMaterial(0.98, 0.42, 0.36, 0.1, 0.25);
    this.matComplete = makePbrMaterial(0.24, 0.88, 0.50, 0.1, 0.25);

    // Initial state: Skillet active/amber ring, Saucepot blue countdown/upcoming ring
    if (this.stationId === "SKILLET") {
      this.applyRingMaterial(this.matAmberActive);
    } else {
      this.applyRingMaterial(this.matBlueUpcoming);
    }
  }

  private applyRingMaterial(mat?: Material): void {
    if (!this.middleRingObject || !mat) return;
    const rmv = this.middleRingObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (rmv) {
      rmv.mainMaterial = mat;
    }
  }

  private initListeners(): void {
    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        this.isDriftAlert = false;
        this.applyRingMaterial(this.stationId === "SKILLET" ? this.matAmberActive : this.matBlueUpcoming);
      }
    });

    this.eventBus.on("DAG_HOLD_TOGGLED", (data: any) => {
      if (data) {
        this.isHeld = data.isHeld;
        if (this.stationId === "SKILLET") {
          this.applyRingMaterial(this.isHeld ? this.matBlueUpcoming : this.matAmberActive);
        } else {
          this.applyRingMaterial(this.matBlueUpcoming);
        }
      }
    });

    this.eventBus.on("HOLD_CONFIRMED", (data: any) => {
      if (data) {
        this.isHeld = data.isHeld;
        this.isDriftAlert = false;
        if (this.stationId === "SKILLET") {
          this.applyRingMaterial(this.isHeld ? this.matBlueUpcoming : this.matAmberActive);
        } else {
          this.applyRingMaterial(this.matBlueUpcoming);
        }
      }
    });

    this.eventBus.on("SCHEDULE_REVISED", (_data: any) => {
      this.isDriftAlert = true;
      if (this.stationId === "SKILLET") {
        this.applyRingMaterial(this.matCoralAlert);
      } else {
        this.applyRingMaterial(this.matBlueUpcoming);
      }
    });

    this.eventBus.on("PLATING_CONVERGENCE", () => {
      this.isPlated = true;
      this.isDriftAlert = false;
      this.isHeld = false;
      this.applyRingMaterial(this.matComplete);
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.isHeld = false;
      this.isPlated = false;
      this.isDriftAlert = false;
      this.applyRingMaterial(this.stationId === "SKILLET" ? this.matAmberActive : this.matBlueUpcoming);
    });
  }

  private onUpdate(): void {
    if (!this.dagController || !this.middleRingObject) {
      return;
    }

    const progress = this.stationId === "SKILLET"
      ? this.dagController.getSkilletProgress()
      : this.dagController.getSaucepotProgress();

    // Contracting ring logic: interpolates scale from 1.0 down to 0.62
    const clampedProgress = Math.max(0.0, Math.min(1.0, progress));
    const targetScale = 1.0 - (clampedProgress * 0.38);

    const t = this.middleRingObject.getTransform();
    t.setLocalScale(new vec3(targetScale, 1.0, targetScale));

    // Subtle breathing pulse when plated or needing attention
    if (this.innerTargetObject && (this.isPlated || this.isDriftAlert)) {
      const speed = this.isDriftAlert ? 7.0 : 4.0;
      const breath = 1.0 + (0.04 * Math.sin(getTime() * speed));
      const it = this.innerTargetObject.getTransform();
      it.setLocalScale(new vec3(breath * 1.1, 1.1, breath * 1.1));
    }
  }
}
