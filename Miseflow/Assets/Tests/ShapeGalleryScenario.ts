import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import {
  estimateShapeObjects,
  estimateShapeTris,
  sanitizeShapeRecipe,
  SHAPE_MAX_OPS,
  SHAPE_MAX_TRIS,
  SHAPE_RECIPES,
} from "../Scripts/Cook/ShapeRecipe";
import { ShapeRecipeBuilder } from "../Scripts/Cook/ShapeRecipeBuilder";

/**
 * ShapeGalleryScenario.ts (v6 W2, id "shape-gallery")
 * Spawns every hand-authored ShapeRecipe once in a row, asserts the triangle cap (<= 450, equal to the sanitizer's
 * estimate), object counts (root + Main + split pieces), that the chicken is 12+ separate irregular pieces (not one
 * mesh, varied piece heights), the per-piece doneness hook, and the sanitizer on junk / flat Smith-shaped input.
 * Prints a count table, then destroys everything it built.
 */
@component
export class ShapeGalleryScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const hold = config && config.getNumber("hold") !== undefined ? (config.getNumber("hold") as number) : 0;
    print("[LEAF] Running ShapeGalleryScenario...");
    await sleep(200);

    // sanitizer: junk rejected, flat Smith output accepted and trimmed into budget
    expect(sanitizeShapeRecipe(null)).toBe(null);
    expect(sanitizeShapeRecipe("not json")).toBe(null);
    expect(sanitizeShapeRecipe({ ops: [] })).toBe(null);
    const flat = sanitizeShapeRecipe({
      name: "probe", mode: "ITEM", profile: [], segs: 0, handle: "NONE", floor: false, rough: 0.4,
      ops: [{ op: "ELLIPSOID", slot: "body", x: 0, y: 1, z: 0, yaw: 0, pitch: 30, roll: 30, sx: 1.4, sy: 1, sz: 1.2, segs: 40, lobes: 3, amp: 0.3, count: 99, jitter: 5, seed: 4, heap: 1, pts: [], pattern: "DISC", split: true }],
    });
    expect(flat).toBeTruthy();
    expect(estimateShapeTris(flat) <= SHAPE_MAX_TRIS).toBe(true);
    expect(flat.ops.length <= SHAPE_MAX_OPS).toBe(true);

    const roots = hold > 0 ? ShapeRecipeBuilder.buildGallery(new vec3(0, -12, -68), 9, 6, 1) : ShapeRecipeBuilder.buildGallery(new vec3(0, 0, -80), 34, 11, 1);
    const ids = Object.keys(SHAPE_RECIPES);
    expect(roots.length).toBe(ids.length);
    let totalTris = 0, totalObjects = 0;
    for (let i = 0; i < ids.length; i++) {
      const root = roots[i];
      const stats = ShapeRecipeBuilder.statsOf(root);
      const sane = sanitizeShapeRecipe(SHAPE_RECIPES[ids[i]]);
      expect(stats).toBeTruthy();
      expect(sane).toBeTruthy();
      expect(stats.tris > 0).toBe(true);
      expect(stats.tris <= SHAPE_MAX_TRIS).toBe(true);
      expect(stats.tris).toBe(estimateShapeTris(sane));
      expect(stats.objects).toBe(estimateShapeObjects(sane));
      expect(root.getChildrenCount()).toBe(stats.pieces);
      totalTris += stats.tris;
      totalObjects += stats.objects;
      print(`[ShapeGallery] ${ids[i]}: tris=${stats.tris} pieces=${stats.pieces} objects=${stats.objects} meshes=${stats.meshes}`);
    }

    // chicken: separate pieces, varied heights (heaped), per-piece doneness without throwing
    const chicken = roots[ids.indexOf("IRREGULAR_CHICKEN_CHUNKS")];
    const pieces = ShapeRecipeBuilder.getSplitPieces(chicken);
    expect(pieces.length >= 12).toBe(true);
    let yMin = 1e9, yMax = -1e9;
    for (const p of pieces) {
      const y = p.getTransform().getLocalPosition().y;
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    expect(yMax - yMin > 0.2).toBe(true);
    ShapeRecipeBuilder.setDoneness(chicken, 1, [0, 1, 2, 3, 4, 5]);
    ShapeRecipeBuilder.setDoneness(chicken, 0.5);
    print(`[ShapeGallery] total tris=${totalTris} objects=${totalObjects} chickenPieces=${pieces.length} heapSpread=${(yMax - yMin).toFixed(2)}cm`);

    if (hold > 0) {
      print("[ShapeGallery] HOLD gallery visible");
      await sleep(hold * 1000);
    }
    await sleep(500);
    for (const r of roots) ShapeRecipeBuilder.destroy(r);
    await sleep(100);
    print("[LEAF] ShapeGalleryScenario PASSED");
  }
}
