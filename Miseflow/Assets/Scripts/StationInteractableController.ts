import { ChoreographyDAG } from "./ChoreographyDAG";
import { MetricPrepBlueprint } from "./MetricPrepBlueprint";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { SpatialTransferArc } from "./SpatialTransferArc";
import { SpatialVisionInspector } from "./SpatialVisionInspector";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

/** v5: cut-guide spacing shown on the prep label (dish 01 = "1.5"). */
function guideCm(data: any): string {
  const s = data && typeof data.spacingCm === "number" && isFinite(data.spacingCm) ? data.spacingCm : 1.5;
  return `${Math.round(s * 10) / 10}`;
}

@component
export class StationInteractableController extends BaseScriptComponent {
  @input
  prepBlueprint?: MetricPrepBlueprint;

  @input
  dagController?: ChoreographyDAG;

  @input
  transferArc?: SpatialTransferArc;

  @input
  visionInspector?: SpatialVisionInspector;

  @input
  prepStatusLabel?: Text3D;

  @input
  skilletStatusLabel?: Text3D;

  @input
  saucepotStatusLabel?: Text3D;

  @input
  debriefCard?: SceneObject;

  @input
  debriefText?: Text3D;

  @input
  driftDecisionCard?: SceneObject;

  @input
  driftDecisionText?: Text3D;

  @input
  rehearsalPropsRoot?: SceneObject;

  private isRehearsalActive: boolean = true;
  private isHoldActive: boolean = false;
  private isTimeWarpActive: boolean = false;
  private isDriftActive: boolean = false;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      if (this.debriefCard) {
        this.debriefCard.enabled = false;
      }
      if (this.driftDecisionCard) {
        this.driftDecisionCard.enabled = false;
      }
      this.initEventListeners();
      this.updateStatusLabels();
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private resolveReferences(): void {
    const selfObj = this.getSceneObject();

    if (!this.prepBlueprint) {
      this.prepBlueprint = selfObj.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
    }
    if (!this.dagController) {
      this.dagController = selfObj.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    }
    if (!this.transferArc) {
      this.transferArc = selfObj.getComponent(SpatialTransferArc.getTypeName()) as SpatialTransferArc;
    }
    if (!this.visionInspector) {
      this.visionInspector = selfObj.getComponent(SpatialVisionInspector.getTypeName()) as SpatialVisionInspector;
    }

    if (!this.prepStatusLabel) {
      const pObj = findByName(selfObj, "PrepStatusLabel");
      if (pObj) {
        this.prepStatusLabel = pObj.getComponent("Component.Text3D") as Text3D || pObj.getComponent("Text3D") as Text3D;
      }
    }
    if (!this.skilletStatusLabel) {
      const sObj = findByName(selfObj, "SkilletStatusLabel");
      if (sObj) {
        this.skilletStatusLabel = sObj.getComponent("Component.Text3D") as Text3D || sObj.getComponent("Text3D") as Text3D;
      }
    }
    if (!this.saucepotStatusLabel) {
      const spObj = findByName(selfObj, "SaucepotStatusLabel");
      if (spObj) {
        this.saucepotStatusLabel = spObj.getComponent("Component.Text3D") as Text3D || spObj.getComponent("Text3D") as Text3D;
      }
    }
    if (!this.debriefCard) {
      this.debriefCard = findByName(selfObj, "PlatingDebriefCard");
    }
    if (this.debriefCard) {
      this.debriefCard.enabled = false;
    }
    if (this.debriefCard && !this.debriefText) {
      const dtObj = findByName(this.debriefCard, "DebriefText");
      if (dtObj) {
        this.debriefText = dtObj.getComponent("Component.Text3D") as Text3D || dtObj.getComponent("Text3D") as Text3D;
      }
    }
    if (!this.driftDecisionCard) {
      this.driftDecisionCard = findByName(selfObj, "DriftDecisionCard");
    }
    if (this.driftDecisionCard) {
      this.driftDecisionCard.enabled = false;
    }
    if (this.driftDecisionCard && !this.driftDecisionText) {
      const ddtObj = findByName(this.driftDecisionCard, "DriftDecisionText");
      if (ddtObj) {
        this.driftDecisionText = ddtObj.getComponent("Component.Text3D") as Text3D || ddtObj.getComponent("Text3D") as Text3D;
      }
    }
    if (!this.rehearsalPropsRoot) {
      this.rehearsalPropsRoot = selfObj;
    }
  }

  private initEventListeners(): void {
    // Slicing reference guide update
    this.eventBus.on("CUT_REFERENCE_STEP", (data: any) => {
      if (this.prepStatusLabel) {
        this.prepStatusLabel.text = `CHOP ${data.sliceIndex}/${data.totalSlices} (${guideCm(data)}cm Guide)`;
      }
    });

    this.eventBus.on("ACOUSTIC_CHOP_DETECTED", (data: any) => {
      if (this.prepStatusLabel) {
        this.prepStatusLabel.text = `CHOP ${data.sliceIndex}/${data.totalSlices} (${guideCm(data)}cm Guide)`;
      }
    });

    // Portion reference accumulation
    this.eventBus.on("VOLUME_DOME_UPDATED", (data: any) => {
      if (this.prepStatusLabel) {
        if (data.isComplete) {
          this.prepStatusLabel.text = "PORTION DOME 100% (REFERENCE) • READY";
        } else {
          const pct = Math.round(data.fillRatio * 100);
          this.prepStatusLabel.text = `PORTION ACCUMULATING: ${pct}%`;
        }
      }
    });

    // Station handoff / completion
    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        this.isDriftActive = false;
        this.isHoldActive = false;
        if (this.driftDecisionCard) {
          this.driftDecisionCard.enabled = false;
        }
        if (this.prepStatusLabel) {
          this.prepStatusLabel.text = "PREP TRANSFERRED • CLEAR";
        }
        if (this.saucepotStatusLabel) {
          this.saucepotStatusLabel.text = "DROP SHALLOTS IN POT NOW";
        }
      }
    });

    // Hero Feature: Prep Drift Resolution
    this.eventBus.on("SCHEDULE_REVISED", (data: any) => {
      this.isDriftActive = true;
      if (this.prepStatusLabel) {
        this.prepStatusLabel.text = "PREP SLIPPED (+25s)";
      }
      if (this.saucepotStatusLabel) {
        this.saucepotStatusLabel.text = "SAUCE DEFERRED (+25s) • HOLD";
      }
      if (this.skilletStatusLabel) {
        this.skilletStatusLabel.text = "ALERT: VERIFY BURNER IS LOW";
      }
      if (this.driftDecisionCard) {
        this.driftDecisionCard.enabled = true;
      }
      if (this.driftDecisionText) {
        this.driftDecisionText.text = "PREP DRIFT RESOLVER (+25s SLIP)\nSauce deferred +25s • Confirm burner low";
      }
      print(`[StationController] Explainable schedule update: ${data.explanation}`);
    });

    this.eventBus.on("HOLD_CONFIRMED", (data: any) => {
      this.isHoldActive = data.isHeld;
      if (this.skilletStatusLabel) {
        this.skilletStatusLabel.text = this.isHoldActive
          ? "HOLD ACKNOWLEDGED • BURNER LOW"
          : "SEARING RESUMED";
      }
      if (this.driftDecisionText) {
        this.driftDecisionText.text = this.isHoldActive
          ? "HOLD ACKNOWLEDGED BY COOK\nBurner Low Verified • Ready for Prep"
          : "WORKFLOW RESUMED";
      }
    });

    // Advisory visual browning scan result
    this.eventBus.on("VISUAL_BROWNING_CHECK", (data: any) => {
      if (this.skilletStatusLabel) {
        this.skilletStatusLabel.text = data.advisoryMessage;
      }
    });

    this.eventBus.on("MAILLARD_VISION_RESULT", (data: any) => {
      if (this.skilletStatusLabel) {
        this.skilletStatusLabel.text = data.badgeText;
      }
    });

    // Plating convergence
    this.eventBus.on("PLATING_CONVERGENCE", (_data: any) => {
      if (this.driftDecisionCard) {
        this.driftDecisionCard.enabled = false;
      }
      if (this.debriefCard) {
        this.debriefCard.enabled = true;
      }
      if (this.debriefText) {
        this.debriefText.text = "3/3 STATIONS SYNCED\nREADY TO PLATE";
      }
      if (this.skilletStatusLabel) {
        this.skilletStatusLabel.text = "PLATED (00:00)";
      }
      if (this.saucepotStatusLabel) {
        this.saucepotStatusLabel.text = "PLATED (00:00)";
      }
      if (this.prepStatusLabel) {
        this.prepStatusLabel.text = "COMPLETE";
      }
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.resetUI();
    });
  }

  // --- Actions callable by SIK Interactables, UI buttons, or LEAF tests ---

  public onStepChopPressed(): void {
    if (this.prepBlueprint) {
      this.prepBlueprint.stepChop();
    }
  }

  public onFillPortionPressed(): void {
    if (this.prepBlueprint) {
      this.prepBlueprint.fillPortion();
    }
  }

  public onTransferPressed(): void {
    this.eventBus.emit("STATION_STEP_COMPLETED", {
      stationId: "PREP",
      triggerSource: "SIK"
    });
  }

  public onCheckSearPressed(): void {
    if (this.visionInspector) {
      this.visionInspector.inspectSear();
    }
    this.eventBus.emit("TRIGGER_AI_VISION_PROBE", {});
  }

  /**
   * Hero Feature Trigger: Simulates +25s prep delay
   */
  public onSimulatePrepDrift(): void {
    this.eventBus.emit("DRIFT_RECORDED", {
      taskId: "prep_shallots",
      deltaSeconds: 25.0,
      reason: "Shallot prep delayed (+25s)"
    });
  }

  /**
   * User confirms physical burner action and acknowledges hold ("Accept changes")
   */
  public onConfirmHoldPressed(): void {
    this.isHoldActive = !this.isHoldActive;
    this.eventBus.emit("HOLD_CONFIRMED", {
      stationId: "SKILLET",
      isHeld: this.isHoldActive,
      acknowledgedByUser: true,
      decision: this.isHoldActive ? "ACCEPT_CHANGES" : "KEEP_CURRENT_PLAN"
    });
  }

  public onAcceptDriftChanges(): void {
    this.isHoldActive = true;
    this.eventBus.emit("HOLD_CONFIRMED", {
      stationId: "SKILLET",
      isHeld: true,
      acknowledgedByUser: true,
      decision: "ACCEPT_CHANGES"
    });
  }

  public onKeepCurrentPlan(): void {
    this.isHoldActive = false;
    this.isDriftActive = false;
    this.eventBus.emit("HOLD_CONFIRMED", {
      stationId: "SKILLET",
      isHeld: false,
      acknowledgedByUser: true,
      decision: "KEEP_CURRENT_PLAN"
    });
  }

  public onToggleHoldPressed(): void {
    if (!this.isDriftActive) {
      this.onSimulatePrepDrift();
    } else {
      this.onConfirmHoldPressed();
    }
  }

  public onToggleTimeWarpPressed(): void {
    this.isTimeWarpActive = !this.isTimeWarpActive;
    const mult = this.isTimeWarpActive ? 10.0 : 1.0;
    this.eventBus.emit("TIME_WARP_TOGGLED", { multiplier: mult, isDemoMode: true });

    if (this.skilletStatusLabel && this.isTimeWarpActive) {
      this.skilletStatusLabel.text = "DEMO TIME (10x FAST FORWARD)";
    }
  }

  public onToggleRehearsalMode(): void {
    this.isRehearsalActive = !this.isRehearsalActive;
    if (this.rehearsalPropsRoot) {
      this.rehearsalPropsRoot.enabled = this.isRehearsalActive;
    }
    this.eventBus.emit("GHOST_MODE_CHANGED", { isRehearsal: this.isRehearsalActive });
    print(`[StationInteractableController] Rehearsal Mode set to: ${this.isRehearsalActive}`);
  }

  public onResetPressed(): void {
    this.eventBus.emit("RESET_REQUESTED");
    if (this.prepBlueprint) {
      this.prepBlueprint.resetBlueprint();
    }
    if (this.dagController) {
      this.dagController.resetEngine();
    }
    this.resetUI();
    print("[StationInteractableController] Full reset completed.");
  }

  private resetUI(): void {
    this.isHoldActive = false;
    this.isTimeWarpActive = false;
    this.isDriftActive = false;
    if (this.debriefCard) {
      this.debriefCard.enabled = false;
    }
    if (this.driftDecisionCard) {
      this.driftDecisionCard.enabled = false;
    }
    this.updateStatusLabels();
  }

  private updateStatusLabels(): void {
    if (this.prepStatusLabel) {
      this.prepStatusLabel.text = "STEP 1: CHOP SHALLOTS (1.5cm)";
    }
    if (this.skilletStatusLabel) {
      this.skilletStatusLabel.text = "STANDBY: SALMON SEAR (60s)";
    }
    if (this.saucepotStatusLabel) {
      this.saucepotStatusLabel.text = "STANDBY: LEMON REDUCTION (50s)";
    }
  }

  private onUpdate(): void {
    if (!this.dagController) return;

    const sRem = Math.ceil(this.dagController.getSkilletRemaining());
    const pRem = Math.ceil(this.dagController.getSaucepotRemaining());

    if (
      sRem > 0 &&
      !this.isHoldActive &&
      this.skilletStatusLabel &&
      this.skilletStatusLabel.text.indexOf("STANDBY") === -1 &&
      this.skilletStatusLabel.text.indexOf("ADVISORY") === -1 &&
      this.skilletStatusLabel.text.indexOf("DEMO TIME") === -1 &&
      this.skilletStatusLabel.text.indexOf("ALERT") === -1
    ) {
      this.skilletStatusLabel.text = `SEARING SALMON: 00:${sRem < 10 ? "0" + sRem : sRem}`;
    }

    if (
      pRem > 0 &&
      !this.isHoldActive &&
      this.saucepotStatusLabel &&
      this.saucepotStatusLabel.text.indexOf("STANDBY") === -1 &&
      this.saucepotStatusLabel.text.indexOf("DROP") === -1 &&
      this.saucepotStatusLabel.text.indexOf("DEFERRED") === -1
    ) {
      this.saucepotStatusLabel.text = `REDUCTION: 00:${pRem < 10 ? "0" + pRem : pRem}`;
    }
  }
}
