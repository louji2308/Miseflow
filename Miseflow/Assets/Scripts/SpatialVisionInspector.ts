import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { MiseFlowSpatialUI } from "./MiseFlowSpatialUI";
import { StationPropsBuilder } from "./StationPropsBuilder";

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
 * SpatialVisionInspector.ts (Visual Browning Cue in v3)
 * Advisory optical appearance reference.
 * Explicit Invariant: Does not claim to measure physical heat or internal doneness.
 * Requires user confirmation as ground truth.
 */
@component
export class SpatialVisionInspector extends BaseScriptComponent {
  @input
  inspectionDiscObject?: SceneObject;

  private inspectionCount: number = 0;
  private isInspecting: boolean = false;
  private inspectTimer: number = 0.0;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  onAwake(): void {
    const root = this.getSceneObject();
    if (!root.getComponent(StationPropsBuilder.getTypeName())) {
      root.createComponent(StationPropsBuilder.getTypeName());
    }
    if (!root.getComponent(MiseFlowSpatialUI.getTypeName())) {
      root.createComponent(MiseFlowSpatialUI.getTypeName());
    }

    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      if (this.inspectionDiscObject) {
        this.inspectionDiscObject.enabled = false;
      }
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private resolveReferences(): void {
    const selfObj = this.getSceneObject();
    if (!this.inspectionDiscObject) {
      this.inspectionDiscObject = findByName(selfObj, "InspectionDisc");
    }
  }

  public inspectSear(): void {
    this.isInspecting = true;
    this.inspectTimer = 1.5;
    this.inspectionCount++;

    if (this.inspectionDiscObject) {
      this.inspectionDiscObject.enabled = true;
    }

    print("[VisualBrowningInspector] Advisory visual browning check triggered...");

    const isFirstCheck = this.inspectionCount === 1;
    const deltaSeconds = isFirstCheck ? 25 : 0;
    const status = isFirstCheck ? "IN_PROGRESS" : "CRUST_DEVELOPED";
    const advisoryMessage = isFirstCheck
      ? "ADVISORY: Crust light; suggest +25s sear (Confirm with cook)"
      : "ADVISORY: Golden crust observed • Ready to flip (Confirm)";

    this.eventBus.emit("VISUAL_BROWNING_CHECK", {
      stationId: "SKILLET",
      status: status,
      deltaSeconds: deltaSeconds,
      advisoryMessage: advisoryMessage,
      requiresUserConfirmation: true,
      badgeText: advisoryMessage // Legacy backward compatibility
    });

    // Legacy event emission for backwards compatibility
    this.eventBus.emit("MAILLARD_VISION_RESULT", {
      stationId: "SKILLET",
      status: isFirstCheck ? "UNDER_SEARED" : "OPTIMAL",
      deltaSeconds: deltaSeconds,
      badgeText: advisoryMessage
    });
  }

  private onUpdate(): void {
    if (!this.isInspecting) return;

    this.inspectTimer -= getDeltaTime();
    if (this.inspectTimer <= 0) {
      this.isInspecting = false;
      if (this.inspectionDiscObject) {
        this.inspectionDiscObject.enabled = false;
      }
      print("[VisualBrowningInspector] Advisory check complete.");
    }
  }
}
