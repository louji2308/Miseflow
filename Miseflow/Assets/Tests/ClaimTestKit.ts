import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ClaimController, CLAIM_ROLES } from "../Scripts/ClaimController";
import { KitchenPersistence } from "../Scripts/KitchenPersistence";
import { KitchenAnchorRoot } from "../Scripts/KitchenAnchorRoot";
import { MiseFlowEventBus, StationRole } from "../Scripts/MiseFlowEventBus";

/**
 * ClaimTestKit.ts
 * Shared helpers for the v7 Stage 2 scenarios (ClaimStationsScenario, KitchenRecallScenario).
 * Sunlit Room coffee table (docs/v7/notes/probe-results.md): top y = -142.5, centre about (0, -298), diameter about 87 cm.
 */

export const TABLE_Y = -142.5;
export const TABLE_CX = 0;
export const TABLE_CZ = -298;
/** Pinch point height above the table top (cm): "a few cm above the table". */
export const PINCH_ABOVE = 4;
export const MEMORY_LABEL_NAME = "KitchenMemoryLabel";
export const RETICLE_NAME = "ClaimReticle";

/** Four spots on the table top, 20 to 44 cm apart, inside the 87 cm top (x spread +-20 cm around 0). */
export const CLAIM_SPOTS: { role: StationRole; x: number; z: number }[] = [
  { role: "BURNER_L", x: -20, z: -305 },
  { role: "BURNER_R", x: 20, z: -305 },
  { role: "BOARD", x: -20, z: -285 },
  { role: "PLATE", x: 20, z: -285 },
];

export function pinchPoint(x: number, z: number): vec3 {
  return new vec3(x, TABLE_Y + PINCH_ABOVE, z);
}

export function rootObject(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const o = global.scene.getRootObject(i);
    if (o.name === name) return o;
  }
  return null;
}

export function childNamed(parent: SceneObject, name: string): SceneObject | null {
  for (let i = 0; i < parent.getChildrenCount(); i++) {
    const c = parent.getChild(i);
    if (c.name === name) return c;
  }
  return null;
}

/** Direct children of KitchenAnchorRoot whose name starts with Station_. */
export function stationChildren(): SceneObject[] {
  const k = KitchenAnchorRoot.getInstance();
  const out: SceneObject[] = [];
  if (!k) return out;
  const root = k.getRoot();
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const c = root.getChild(i);
    if (c.name.indexOf("Station_") === 0 && c.name !== "StationsRoot") out.push(c);
  }
  return out;
}

export function stationWorld(role: StationRole): vec3 | null {
  const o = ClaimController.findStation(role);
  return o ? o.getTransform().getWorldPosition() : null;
}

export function stationUpTiltDeg(o: SceneObject): number {
  const up = o.getTransform().getWorldRotation().multiplyVec3(vec3.up()).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI;
}

/** True when the claim reticle object is enabled anywhere in the hierarchy. */
export function reticleVisible(): boolean {
  const r = rootObject(RETICLE_NAME);
  if (!r) return false;
  return r.enabled && r.isEnabledInHierarchy;
}

/** Independent surface measurement: raycastWorldMesh straight down at (x, z) from above the table. Null when no hit. */
export function measureSurface(x: number, z: number): vec3 | null {
  let dt: DeviceTracking | null = null;
  const walk = (o: SceneObject): void => {
    if (dt) return;
    const c = o.getComponent("Component.DeviceTracking") as DeviceTracking;
    if (c) {
      dt = c;
      return;
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i));
  };
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) walk(global.scene.getRootObject(i));
  if (!dt) return null;
  try {
    const res = (dt as DeviceTracking).raycastWorldMesh(new vec3(x, TABLE_Y + 20, z), new vec3(x, TABLE_Y - 40, z));
    if (!res || res.length === 0) return null;
    let best = res[0];
    for (const r of res) if (r.position.y > best.position.y) best = r;
    return best.position;
  } catch (e) {
    return null;
  }
}

export interface ClaimLog {
  stationClaimed: { role: StationRole; position: vec3; surface: string }[];
  kitchenClaimed: number;
  recalled: number;
  dispose(): void;
}

/** Subscribes to STATION_CLAIMED, KITCHEN_CLAIMED and KITCHEN_RECALLED. Always call dispose() in a finally. */
export function listenClaimEvents(): ClaimLog {
  const bus = MiseFlowEventBus.getInstance();
  const log: ClaimLog = {
    stationClaimed: [],
    kitchenClaimed: 0,
    recalled: 0,
    dispose: () => {
      bus.off("STATION_CLAIMED", onStation);
      bus.off("KITCHEN_CLAIMED", onKitchen);
      bus.off("KITCHEN_RECALLED", onRecalled);
    },
  };
  const onStation = (d?: any) => {
    if (d) log.stationClaimed.push({ role: d.role, position: d.position, surface: d.surface });
  };
  const onKitchen = () => {
    log.kitchenClaimed++;
  };
  const onRecalled = () => {
    log.recalled++;
  };
  bus.on("STATION_CLAIMED", onStation);
  bus.on("KITCHEN_CLAIMED", onKitchen);
  bus.on("KITCHEN_RECALLED", onRecalled);
  return log;
}

/** Leaves the project pristine: store empty, no Station_*, no memory label, no claim pass, kitchen shown at P0. */
export function resetToPristine(): void {
  const cc = ClaimController.ensure();
  if (cc.isClaiming()) cc.cancel();
  KitchenPersistence.ensure().forget();
  ClaimController.clearStations();
  const k = KitchenAnchorRoot.ensure();
  if (k.isContentHidden()) k.setContentHidden(false);
  const label = childNamed(k.getRoot(), MEMORY_LABEL_NAME);
  if (label) label.destroy();
  k.resetPose();
}

/** Claims the four spots through the surface pipeline (claimFromPinchPoint). Returns the number accepted. */
export async function claimFourSpots(cc: ClaimController): Promise<number> {
  let accepted = 0;
  for (const s of CLAIM_SPOTS) {
    if (cc.claimFromPinchPoint(s.role, pinchPoint(s.x, s.z))) accepted++;
    await sleep(150);
  }
  return accepted;
}

export { CLAIM_ROLES };
