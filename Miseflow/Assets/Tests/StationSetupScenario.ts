import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { HeadPoseBillboard } from "../Scripts/HeadPoseBillboard";

const RAD = Math.PI / 180;

/** Names of the direct children plus the total descendant count of an object (D3: nothing may grow under the camera). */
function childSnapshot(o: SceneObject): { names: string[]; total: number } {
  const names: string[] = [];
  let total = 0;
  const walk = (n: SceneObject) => {
    for (let i = 0; i < n.getChildrenCount(); i++) {
      total++;
      walk(n.getChild(i));
    }
  };
  for (let i = 0; i < o.getChildrenCount(); i++) names.push(o.getChild(i).name);
  walk(o);
  return { names, total };
}

/** Local facing of an object, as yaw (deg about +Y) and pitch (deg, positive = face tilts up toward a viewer above). */
function facingDeg(o: SceneObject): { yaw: number; pitch: number } {
  const f = o.getTransform().getLocalRotation().multiplyVec3(vec3.forward());
  return { yaw: Math.atan2(f.x, f.z) / RAD, pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) / RAD };
}

function wrap180(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

@component
export class StationSetupScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 1: StationSetupScenario...");
    await sleep(1000);

    // D3 rule: record what hangs under the camera now; nothing of ours may ever be parented to it.
    const camObj = findSceneObjectByName("Camera Object");
    expect(camObj, "Camera Object missing").toBeTruthy();
    const camBefore = childSnapshot(camObj);

    const root = findSceneObjectByName("StationsRoot");
    expect(root).toBeTruthy();
    expect(root.enabled).toBe(true);

    const prepStation = findSceneObjectByName("PrepBoardStation");
    expect(prepStation).toBeTruthy();
    expect(prepStation.enabled).toBe(true);

    const skilletStation = findSceneObjectByName("SkilletStation");
    expect(skilletStation).toBeTruthy();
    expect(skilletStation.enabled).toBe(true);

    const potStation = findSceneObjectByName("SaucepotStation");
    expect(potStation).toBeTruthy();
    expect(potStation.enabled).toBe(true);

    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    expect(prepLabelObj).toBeTruthy();
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText).toBeTruthy();
    expect(prepText.text.indexOf("CHOP SHALLOTS") !== -1).toBe(true);

    const debriefCard = findSceneObjectByName("PlatingDebriefCard");
    expect(debriefCard).toBeTruthy();
    expect(debriefCard.enabled).toBe(false);

    // v7 Stage 1: StationsRoot lives under KitchenAnchorRoot (a scene-root object), world pose unchanged.
    const kitchen = root.hasParent() ? root.getParent() : null;
    expect(kitchen !== null && kitchen.name === "KitchenAnchorRoot", "StationsRoot parent must be KitchenAnchorRoot").toBe(true);
    expect(kitchen.hasParent(), "KitchenAnchorRoot must be a scene root").toBe(false);
    const rootPos = root.getTransform().getWorldPosition();
    const rootOff = rootPos.sub(new vec3(0, -17.5, -76)).length;
    expect(rootOff < 0.05, `StationsRoot world pos off by ${rootOff} cm`).toBe(true);
    const kScale = kitchen.getTransform().getWorldScale();
    expect(Math.abs(kScale.x - 1) < 0.001 && Math.abs(kScale.y - 1) < 0.001 && Math.abs(kScale.z - 1) < 0.001, "KitchenAnchorRoot world scale must be 1").toBe(true);

    const slab = findSceneObjectByName("KitchenCountertopSurface");
    expect(slab, "KitchenCountertopSurface missing").toBeTruthy();
    const slabRmv = slab.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    expect(slabRmv, "slab has no RenderMeshVisual").toBeTruthy();
    expect(slabRmv.enabled, "slab RenderMeshVisual must be enabled in the editor").toBe(true);

    // v7 Stage 1B: live head-pose billboarding. A head 40 cm to the right must swing the skillet pill's yaw,
    // keep its fixed 14 deg pitch, and leave the flush rings alone. The hook is always cleared.
    const pill = findSceneObjectByName("SkilletStationUI");
    expect(pill, "SkilletStationUI missing").toBeTruthy();
    const ringNames = ["DiegeticChronoRingRoot", "BurnerArcs_Sear", "BurnerArcs_Simmer"];
    const rings: { obj: SceneObject; rot: quat }[] = [];
    for (const n of ringNames) {
      const o = findSceneObjectByName(n);
      if (o) rings.push({ obj: o, rot: o.getTransform().getLocalRotation() });
    }
    expect(rings.length > 0, "no ring/arc object found to guard").toBe(true);
    try {
      await sleep(300);
      const before = facingDeg(pill);
      const cam = HeadPoseBillboard.realCameraWorldPos();
      HeadPoseBillboard.setSimulatedCameraWorldPos(new vec3(cam.x + 40, cam.y, cam.z));
      await sleep(500);
      const after = facingDeg(pill);
      const dYaw = Math.abs(wrap180(after.yaw - before.yaw));
      expect(dYaw > 5, `pill yaw changed only ${dYaw} deg for a 40 cm head move`).toBe(true);
      expect(Math.abs(after.pitch - 14) <= 1, `pill pitch ${after.pitch} deg, expected 14 +-1`).toBe(true);
      for (const r of rings) {
        const q = r.obj.getTransform().getLocalRotation();
        const dot = Math.abs(q.x * r.rot.x + q.y * r.rot.y + q.z * r.rot.z + q.w * r.rot.w);
        expect(dot > 0.9999, `${r.obj.name} rotation changed (billboarded by mistake)`).toBe(true);
      }
    } finally {
      HeadPoseBillboard.setSimulatedCameraWorldPos(null);
    }

    // Nothing was added under the camera by the lens or by this scenario.
    const camAfter = childSnapshot(camObj);
    expect(camAfter.total <= camBefore.total, `Camera Object grew from ${camBefore.total} to ${camAfter.total} descendants`).toBe(true);
    for (const n of camAfter.names) expect(camBefore.names.indexOf(n) !== -1, `new child under Camera Object: ${n}`).toBe(true);

    print("[LEAF] Scenario 1 PASSED: All 3 stations & status labels verified.");
  }
}
