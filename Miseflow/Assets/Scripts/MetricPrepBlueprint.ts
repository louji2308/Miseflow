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
 * MetricPrepBlueprint.ts
 * Advisory cutting reference guides and visual portion accumulation:
 * - 1.5 cm dice spacing guideline
 * - Calibrated portion reference dome (visual volume reference, not a scale)
 */
@component
export class MetricPrepBlueprint extends BaseScriptComponent {
  @input
  spacingCm: number = 1.5;

  @input
  totalSlices: number = 8;

  @input
  startPositionX: number = -8.0;

  @input
  laserCurtainObject?: SceneObject;

  @input
  portionDomeObject?: SceneObject;

  private currentSliceIndex: number = 0;
  private currentFillRatio: number = 0.0;
  private isPrepComplete: boolean = false;
  private initialX: number = -8.0;
  private matCyan?: Material;
  private matGreen?: Material;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      this.resetBlueprint();
    });
  }

  private resolveReferences(): void {
    const selfObj = this.getSceneObject();
    if (!this.laserCurtainObject) {
      this.laserCurtainObject = findByName(selfObj, "LaserCutCurtain");
    }
    if (!this.portionDomeObject) {
      this.portionDomeObject = findByName(selfObj, "VolumetricPortionDome");
    }

    this.matCyan = makePbrMaterial(0.18, 0.86, 0.96, 0.1, 0.22);
    this.matGreen = makePbrMaterial(0.24, 0.88, 0.50, 0.1, 0.25);

    if (this.startPositionX !== undefined) {
      this.initialX = this.startPositionX;
    } else if (this.laserCurtainObject) {
      this.initialX = this.laserCurtainObject.getTransform().getLocalPosition().x;
    }
  }

  public resetBlueprint(): void {
    this.currentSliceIndex = 0;
    this.currentFillRatio = 0.0;
    this.isPrepComplete = false;
    this.updateLaserPosition();
    this.updateDomeFillVisual();
  }

  public stepChop(): void {
    if (this.currentSliceIndex < this.totalSlices) {
      this.currentSliceIndex++;
      this.updateLaserPosition();

      this.eventBus.emit("CUT_REFERENCE_STEP", {
        sliceIndex: this.currentSliceIndex,
        totalSlices: this.totalSlices,
        spacingCm: this.spacingCm
      });

      // Legacy event
      this.eventBus.emit("ACOUSTIC_CHOP_DETECTED", {
        sliceIndex: this.currentSliceIndex,
        totalSlices: this.totalSlices,
        spacingCm: this.spacingCm
      });

      print(`[MetricPrepBlueprint] Slicing guide stepped: ${this.currentSliceIndex} / ${this.totalSlices}`);
    }
  }

  public fillPortion(increment: number = 0.34): void {
    this.currentFillRatio = Math.min(1.0, this.currentFillRatio + increment);
    this.updateDomeFillVisual();

    const isFull = this.currentFillRatio >= 0.99;
    if (isFull && !this.isPrepComplete) {
      this.isPrepComplete = true;
      print("[MetricPrepBlueprint] Portion reference target reached (100%).");
    }

    this.eventBus.emit("VOLUME_DOME_UPDATED", {
      fillRatio: this.currentFillRatio,
      referenceVolumeCm3: Math.round(this.currentFillRatio * 45),
      isComplete: this.isPrepComplete,
      // Legacy backward compatibility
      gramsEstimated: Math.round(this.currentFillRatio * 45)
    });
  }

  public getSliceIndex(): number {
    return this.currentSliceIndex;
  }

  public getFillRatio(): number {
    return this.currentFillRatio;
  }

  public isComplete(): boolean {
    return this.isPrepComplete;
  }

  public getStartPositionX(): number {
    return this.initialX;
  }

  private updateLaserPosition(): void {
    if (!this.laserCurtainObject) return;

    const t = this.laserCurtainObject.getTransform();
    const pos = t.getLocalPosition();
    const newX = this.initialX + (this.currentSliceIndex * this.spacingCm);
    t.setLocalPosition(new vec3(newX, pos.y, pos.z));
  }

  private updateDomeFillVisual(): void {
    if (!this.portionDomeObject) return;

    const t = this.portionDomeObject.getTransform();
    const s = 0.5 + (this.currentFillRatio * 0.5);
    t.setLocalScale(new vec3(s, s, s));

    const rmv = this.portionDomeObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (rmv) {
      if (this.currentFillRatio >= 0.99 && this.matGreen) {
        rmv.mainMaterial = this.matGreen;
      } else if (this.matCyan) {
        rmv.mainMaterial = this.matCyan;
      }
    }
  }
}
