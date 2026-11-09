import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { KitchenAnchorRoot } from "../Scripts/KitchenAnchorRoot";
import { StationTarget, TARGET_COLLIDER_CM, isVisiblyShown } from "../Scripts/StationTarget";
import { expectNoLegacyOrDockUi, hubOrFail, resetToDish01 } from "./Stage3TestKit";

/**
 * FovBudgetScenario.ts (id "fov-budget-scenario") - v7 Stage 3, plan Part F row fov-budget.
 * Steady state (dish 01, palette closed, no alert): every visible piece of UI sits inside a 50 x 35 x 20 cm band around the
 * kitchen root, nothing of ours is parented under `Camera Object`, every station target collider is >= 4.5 cm.
 * "Visible UI" = every Text / Text3D with a non-empty string that is enabled in the hierarchy and not scale-hidden, plus the
 * full open footprint of every station target (card included, so an opening card can never leave the band).
 * Band (kitchen-local, cm): x -25..25, y -5..30, z -10..10 (the kitchen root is the slab centre at the counter surface).
 */

const BAND = { x0: -25, x1: 25, y0: -5, y1: 30, z0: -10, z1: 10 };
const CARD_EXTENT_RIGHT = 14.2; // plate card: 17.3 wide, circle edge at -3.1 -> reaches +14.2 from the target centre
const CARD_EXTENT_LEFT = 3.1;
const CARD_HALF_H = 3.5;

interface Hit {
  name: string;
  p: vec3;
}

function collectText(root: SceneObject, out: Hit[], skip: (o: SceneObject) => boolean): void {
  if (skip(root)) return;
  if (!root.enabled) return;
  const texts: any[] = [];
  const t2 = root.getComponents("Component.Text") as any[];
  const t3 = root.getComponents("Component.Text3D") as any[];
  for (const t of t2) texts.push(t);
  for (const t of t3) texts.push(t);
  for (const t of texts) {
    let s = "";
    try {
      s = String(t.text || "");
    } catch (e) {
      s = "";
    }
    if (s.trim().length === 0) continue;
    if (!t.enabled) continue;
    if (!isVisiblyShown(root)) continue;
    out.push({ name: root.name, p: root.getTransform().getWorldPosition() });
  }
  for (let i = 0; i < root.getChildrenCount(); i++) collectText(root.getChild(i), out, skip);
}

@component
export class FovBudgetScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running FovBudgetScenario...");
    await sleep(500);
    await resetToDish01();
    await sleep(1500);

    const hub = hubOrFail();
    const kitchen = KitchenAnchorRoot.getInstance();
    expect(kitchen, "KitchenAnchorRoot missing").toBeTruthy();
    const k = kitchen as KitchenAnchorRoot;
    expectNoLegacyOrDockUi("steady state");

    // nothing of ours under the camera
    const cam = findSceneObjectByName("Camera Object");
    expect(cam, "Camera Object missing").toBeTruthy();
    const camKids: string[] = [];
    for (let i = 0; i < cam.getChildrenCount(); i++) camKids.push(cam.getChild(i).name);
    const ours = camKids.filter((n) => /StationTarget|DirectorPalette|Station_|LegacyUi|KitchenAnchor|MiseFlow|Cook|Claim/.test(n));
    print(`[Stage3] Camera Object children: ${camKids.join(", ") || "(none)"}`);
    expect(ours.length, `Camera Object holds our UI: ${ours.join(", ")}`).toBe(0);
    for (const t of hub.getTargets()) {
      let p: SceneObject | null = t.root;
      while (p) {
        expect(p.name !== "Camera Object", `target ${t.id} is parented under Camera Object`).toBe(true);
        p = p.hasParent() ? p.getParent() : null;
      }
    }

    // colliders
    let minCollider = 99;
    for (const t of hub.getTargets()) {
      const c = t.getColliderCm();
      minCollider = Math.min(minCollider, c);
      expect(c >= TARGET_COLLIDER_CM - 0.001, `target ${t.id} collider ${c} cm < 4.5`).toBe(true);
    }
    const plate = hub.getPlateTarget();
    if (plate) expect(plate.getSecondColliderCm() >= TARGET_COLLIDER_CM - 0.001, "Name a dish collider < 4.5 cm").toBe(true);

    // band
    const hits: Hit[] = [];
    const skip = (o: SceneObject) => o.name === "Camera Object" || o.name.indexOf("Leaf") === 0 || o.name.indexOf("StationTarget_") === 0 || o.name === "StationTargetHub";
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) collectText(global.scene.getRootObject(i), hits, skip);
    const lo = new vec3(1e9, 1e9, 1e9);
    const hi = new vec3(-1e9, -1e9, -1e9);
    const grow = (p: vec3) => {
      lo.x = Math.min(lo.x, p.x);
      lo.y = Math.min(lo.y, p.y);
      lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x);
      hi.y = Math.max(hi.y, p.y);
      hi.z = Math.max(hi.z, p.z);
    };
    const bad: string[] = [];
    const inBand = (p: vec3) => p.x >= BAND.x0 && p.x <= BAND.x1 && p.y >= BAND.y0 && p.y <= BAND.y1 && p.z >= BAND.z0 && p.z <= BAND.z1;
    for (const h of hits) {
      const p = k.worldToKitchen(h.p);
      grow(p);
      if (!inBand(p)) bad.push(`${h.name}(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`);
    }
    for (const t of hub.getTargets()) {
      const c = k.worldToKitchen(t.root.getTransform().getWorldPosition());
      const right = t.isPlate ? CARD_EXTENT_RIGHT : 8.9;
      const a = new vec3(c.x - CARD_EXTENT_LEFT, c.y - CARD_HALF_H, c.z);
      const b = new vec3(c.x + right, c.y + CARD_HALF_H, c.z);
      grow(a);
      grow(b);
      if (!inBand(a) || !inBand(b)) bad.push(`target ${t.id}(${a.x.toFixed(1)}..${b.x.toFixed(1)},${a.y.toFixed(1)}..${b.y.toFixed(1)},${c.z.toFixed(1)})`);
    }
    print(
      `[Stage3] visible UI: ${hits.length} text objects + ${hub.getTargets().length} target footprints; kitchen-local extents x ${lo.x.toFixed(1)}..${hi.x.toFixed(1)} (${(hi.x - lo.x).toFixed(1)}), y ${lo.y.toFixed(1)}..${hi.y.toFixed(1)} (${(hi.y - lo.y).toFixed(1)}), z ${lo.z.toFixed(1)}..${hi.z.toFixed(1)} (${(hi.z - lo.z).toFixed(1)}); min collider ${minCollider.toFixed(2)} cm`
    );
    expect(bad.length, `UI outside the 50x35x20 band: ${bad.slice(0, 8).join(" | ")}`).toBe(0);
    expect(hi.x - lo.x <= 50 && hi.y - lo.y <= 35 && hi.z - lo.z <= 20, "UI extents exceed 50x35x20").toBe(true);
    print("[LEAF] FovBudgetScenario PASSED: UI inside the 50 x 35 x 20 cm band, nothing under the camera, colliders >= 4.5 cm.");
  }
}
