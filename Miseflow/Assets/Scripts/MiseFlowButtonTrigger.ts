import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { StationInteractableController } from "./StationInteractableController";
import { AutoCookController } from "./AutoCookController";

function findInScene(name: string): SceneObject | null {
  const rootCount = global.scene.getRootObjectsCount();
  for (let i = 0; i < rootCount; i++) {
    const root = global.scene.getRootObject(i);
    const found = findByName(root, name);
    if (found) return found;
  }
  return null;
}

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

@component
export class MiseFlowButtonTrigger extends BaseScriptComponent {
  @input
  actionType: string = "";

  @input
  controller?: StationInteractableController;

  private interactable?: Interactable;

  // v5: actions owned by other components (briefing deck, AI Dish) register here, so this trigger
  // never imports them (no circular imports). Keyed by actionType.
  private static actionHandlers: { [action: string]: () => void } = {};

  public static registerAction(action: string, handler: () => void): void {
    MiseFlowButtonTrigger.actionHandlers[action] = handler;
  }

  /** v5 UIKit-owned buttons (passive triggers): action type by object name, "" for legacy buttons. */
  private static registeredActionForName(n: string): string {
    if (n.indexOf("CycleDish") !== -1) return "CYCLE_DISH";
    if (n.indexOf("StepGuide") !== -1) return "STEP_GUIDE"; // K1a step card toggle
    if (n.indexOf("BriefingPrev") !== -1) return "BRIEFING_PREV";
    if (n.indexOf("BriefingNext") !== -1) return "BRIEFING_NEXT";
    if (n.indexOf("BriefingSkip") !== -1) return "BRIEFING_SKIP";
    // P5 Dish Studio: Btn_StudioSpeak -> STUDIO_SPEAK, Btn_StudioChip_3 -> STUDIO_CHIP_3, Btn_LetsCook -> LETS_COOK
    if (n.indexOf("Btn_Studio") === 0) return "STUDIO_" + n.substring(10).toUpperCase();
    if (n.indexOf("LetsCook") !== -1) return "LETS_COOK";
    // Chef Director step card (UIKit-owned): LEAF/automation entry points only
    if (n.indexOf("Btn_CookDoStep") === 0) return "COOK_DO_STEP";
    if (n.indexOf("Btn_CookAuto") === 0) return "COOK_AUTO";
    return "";
  }

  onAwake(): void {
    this.deduceActionTypeFromName();
    // WS9-P3: Btn_AutoCook is a UIKit Director button that owns its own input; this trigger is a
    // passive LEAF/automation entry point there (no extra collider / Interactable -> no double fire).
    // v5: same for Btn_CycleDish and the Btn_Briefing* deck buttons.
    if (this.actionType === "AUTO_COOK" || this.getSceneObject().name.indexOf("AutoCook") !== -1) return;
    if (MiseFlowButtonTrigger.registeredActionForName(this.getSceneObject().name) !== "") return;
    this.ensureCollider();
    this.ensureInteractable();

    this.createEvent("OnStartEvent").bind(() => {
      this.resolveController();
      if (this.interactable) {
        this.interactable.onTriggerStart.add((_e: InteractorEvent) => {
          this.triggerAction();
        });
      }
    });
  }

  private deduceActionTypeFromName(): void {
    if (this.actionType && this.actionType.length > 0) return;

    const n = this.getSceneObject().name;
    const registered = MiseFlowButtonTrigger.registeredActionForName(n);
    if (registered !== "") {
      this.actionType = registered;
    } else if (n.indexOf("AutoCook") !== -1) {
      this.actionType = "AUTO_COOK";
    } else if (n.indexOf("StepChop") !== -1) {
      this.actionType = "STEP_CHOP";
    } else if (n.indexOf("FillPortion") !== -1) {
      this.actionType = "FILL_PORTION";
    } else if (n.indexOf("Transfer") !== -1) {
      this.actionType = "TRANSFER";
    } else if (n.indexOf("CheckSear") !== -1) {
      this.actionType = "CHECK_SEAR";
    } else if (n.indexOf("ToggleHold") !== -1) {
      this.actionType = "HOLD";
    } else if (n.indexOf("ToggleTimeWarp") !== -1) {
      this.actionType = "TIME_WARP";
    } else if (n.indexOf("Reset") !== -1) {
      this.actionType = "RESET";
    } else if (n.indexOf("Rehearsal") !== -1) {
      this.actionType = "REHEARSAL";
    } else {
      this.actionType = "STEP_CHOP";
    }
  }

  private ensureCollider(): void {
    let collider = this.getSceneObject().getComponent("Physics.ColliderComponent") as ColliderComponent;
    if (!collider) {
      try {
        collider = this.getSceneObject().createComponent("Physics.ColliderComponent") as ColliderComponent;
        const shape = Shape.createBoxShape();
        shape.size = new vec3(12, 5, 8);
        collider.shape = shape;
      } catch (err) {
        print(`[MiseFlowButtonTrigger] Collider setup note: ${err}`);
      }
    }
  }

  private ensureInteractable(): void {
    try {
      this.interactable = this.getSceneObject().getComponent(Interactable.getTypeName()) as Interactable;
      if (!this.interactable) {
        this.interactable = this.getSceneObject().createComponent(Interactable.getTypeName()) as Interactable;
      }
      if (this.interactable) {
        this.interactable.targetingMode = 3; // Both Direct and Indirect
      }
    } catch (err) {
      print(`[MiseFlowButtonTrigger] Interactable setup note: ${err}`);
    }
  }

  private resolveController(): void {
    if (this.controller) return;

    let curr: SceneObject | null = this.getSceneObject().getParent();
    while (curr) {
      const c = curr.getComponent(StationInteractableController.getTypeName()) as StationInteractableController;
      if (c) {
        this.controller = c;
        return;
      }
      curr = curr.getParent();
    }

    const root = findInScene("StationsRoot");
    if (root) {
      this.controller = root.getComponent(StationInteractableController.getTypeName()) as StationInteractableController;
    }
  }

  public triggerAction(): void {
    // name check as well: on a runtime-created component the deduced type is not reliable
    if (this.actionType === "AUTO_COOK" || this.getSceneObject().name.indexOf("AutoCook") !== -1) {
      this.actionType = "AUTO_COOK";
      const auto = AutoCookController.getInstance();
      if (auto) auto.toggle();
      else print("[MiseFlowButtonTrigger] AutoCookController not found");
      return;
    }
    // v5 registered actions (handlers apply their own Auto Cook guard where it matters)
    const registered = MiseFlowButtonTrigger.registeredActionForName(this.getSceneObject().name);
    if (registered !== "") {
      this.actionType = registered;
      const handler = MiseFlowButtonTrigger.actionHandlers[registered];
      if (handler) {
        try {
          handler();
        } catch (e) {
          print(`[MiseFlowButtonTrigger] ${registered} handler error: ${e}`);
        }
      } else {
        print(`[MiseFlowButtonTrigger] no handler registered for ${registered}`);
      }
      return;
    }
    // While Auto Cook drives the kitchen, manual steps stand down (Reset still cancels it).
    if (AutoCookController.isAutoRunning() && this.actionType !== "RESET") {
      print(`[MiseFlowButtonTrigger] Auto Cook running: ignoring ${this.actionType} (press Stop or Reset first)`);
      return;
    }

    if (!this.controller) {
      this.resolveController();
    }

    if (!this.controller) {
      print(`[MiseFlowButtonTrigger] No controller found for ${this.actionType}`);
      return;
    }

    print(`[MiseFlowButtonTrigger] Triggering action: ${this.actionType}`);

    switch (this.actionType) {
      case "STEP_CHOP":
        this.controller.onStepChopPressed();
        break;
      case "FILL_PORTION":
        this.controller.onFillPortionPressed();
        break;
      case "TRANSFER":
        this.controller.onTransferPressed();
        break;
      case "CHECK_SEAR":
        this.controller.onCheckSearPressed();
        break;
      case "HOLD":
        this.controller.onToggleHoldPressed();
        break;
      case "TIME_WARP":
        this.controller.onToggleTimeWarpPressed();
        break;
      case "RESET":
        this.controller.onResetPressed();
        break;
      case "REHEARSAL":
        this.controller.onToggleRehearsalMode();
        break;
      default:
        print(`[MiseFlowButtonTrigger] Unknown action: ${this.actionType}`);
        break;
    }
  }
}
