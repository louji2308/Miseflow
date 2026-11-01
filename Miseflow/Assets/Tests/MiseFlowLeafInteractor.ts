import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractablesByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowButtonTrigger } from "../Scripts/MiseFlowButtonTrigger";
import { StationInteractableController } from "../Scripts/StationInteractableController";

export class MiseFlowLeafInteractor extends DefaultLeafInteractor {
  async tapButton(buttonName: string): Promise<void> {
    const obj = findSceneObjectByName(buttonName);
    if (obj) {
      const trigger = obj.getComponent(MiseFlowButtonTrigger.getTypeName()) as MiseFlowButtonTrigger;
      if (trigger) {
        trigger.triggerAction();
        await sleep(250);
        return;
      }
    }

    const interactables = findInteractablesByName(buttonName, undefined, true);
    if (interactables && interactables.length > 0) {
      await this.trigger(interactables[0]);
      await sleep(250);
      return;
    }

    throw new Error(`Button "${buttonName}" not found or not interactable.`);
  }

  getController(): StationInteractableController | null {
    const root = findSceneObjectByName("StationsRoot");
    if (!root) return null;
    return root.getComponent(StationInteractableController.getTypeName()) as StationInteractableController;
  }
}
