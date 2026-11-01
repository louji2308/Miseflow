import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { StationInteractableController } from "./StationInteractableController";

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

  onAwake(): void {
    this.deduceActionTypeFromName();
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
    if (n.indexOf("StepChop") !== -1) {
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
