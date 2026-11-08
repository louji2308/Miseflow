import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { SHAPE_RECIPES } from "../Scripts/Cook/ShapeRecipe";
import { ShapeRecipeBuilder } from "../Scripts/Cook/ShapeRecipeBuilder";
import { buildBowl, buildPlate, buildSaucepan, buildSkillet, buildSpatula, buildKnife, itemMat, makeFallbackProp, meshObj } from "../Scripts/Cook/CookProps";
import { buildWok } from "../Scripts/VesselGenerators";
import { buildTawa } from "../Scripts/ToolGenerators";
import { buildVegStages } from "../Scripts/VegGenerators";
import { getCatalogEntry } from "../Scripts/AI/AssetPageTable";
import { MeshAcc } from "../Scripts/StationPropsBuilder";

/**
 * AssetGalleryScenario.ts (dev only, id "asset-gallery")
 * Design-review gallery of the procedural kitchen assets, floating above the bench in three rows:
 *   row A (z -60): kadai, tawa, skillet, saucepan, bowl, plate, spatula, knife
 *   row B (z -76): every SHAPE_RECIPES entry at 1.5x its Cook bench scale
 *   row C (z -92): ramekin / cups / flour dish fallbacks + veg (whole and cut pile)
 * parameters: hold (seconds, default 0). Destroys everything at the end.
 */
const KIND_SCALE: { [id: string]: number } = {
  IRREGULAR_CHICKEN_CHUNKS: 0.5, ROLLING_PIN: 0.36, WOODEN_BOARD: 0.5, CURRY_LEAF_SPRIG: 0.5, LEMON_WEDGE: 0.45, FLOUR_DISH: 0.27,
  DOUGH_BALL: 0.55, FLATBREAD_DISC: 0.35, SKIMMER: 0.45, WOODEN_SPOON: 0.48, BRUSH: 0.6,
};

@component
export class AssetGalleryScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const hold = config && config.getNumber("hold") !== undefined ? (config.getNumber("hold") as number) : 0;
    print("[LEAF] Running AssetGalleryScenario...");
    await sleep(200);
    const root = global.scene.createSceneObject("AssetGalleryRoot");
    root.getTransform().setLocalPosition(new vec3(150, -10, 0)); // clear air beside the bench
    const place = (o: SceneObject, x: number, y: number, z: number, s: number = 1) => {
      o.setParent(root);
      const t = o.getTransform();
      t.setLocalPosition(new vec3(x, y, z));
      t.setLocalScale(new vec3(s, s, s));
    };
    const Y = 6;
    // row A: vessels + tools
    const holderK = global.scene.createSceneObject("Gal_Kadai");
    const k = buildWok(holderK);
    k.root.enabled = true;
    k.kadaiLoops.enabled = true;
    k.wokHandle.enabled = false;
    place(holderK, -52, Y, -60, 0.6);
    const holderT = global.scene.createSceneObject("Gal_Tawa");
    const tw = buildTawa(holderT);
    tw.enabled = true;
    place(holderT, -32, Y, -60, 0.6);
    place(buildSkillet("Gal_Skillet").root, -14, Y, -60, 1);
    place(buildSaucepan("Gal_Saucepan", 1).root, 0, Y, -60, 1);
    place(buildBowl("Gal_Bowl", 5).root, 14, Y, -60, 1);
    place(buildPlate("Gal_Plate", 5.6).root, 28, Y, -60, 1);
    place(buildSpatula("Gal_Spatula").root, 38, Y, -58, 1);
    place(buildKnife("Gal_Knife").root, 38, Y, -63, 1);

    // row B: shape recipes
    const ids = Object.keys(SHAPE_RECIPES);
    let x = -54;
    for (const id of ids) {
      const s = (KIND_SCALE[id] || 0.5) * 1.5;
      const b = ShapeRecipeBuilder.build(SHAPE_RECIPES[id], null, "Gal_" + id);
      place(b, x, Y, -76, s);
      x += id === "WOODEN_BOARD" ? 16 : id === "ROLLING_PIN" || id === "SKIMMER" || id === "WOODEN_SPOON" ? 12 : 9;
    }
    expect(ids.length > 0).toBe(true);

    // row C: containers + veg
    const fb: [string, number[]][] = [["SPICE_RAMEKIN", [0.85, 0.2, 0.1]], ["LIQUID_CUP", [0.95, 0.8, 0.25]], ["DAIRY_CUP", [0.97, 0.96, 0.9]], ["FLOUR_DISH", [0.97, 0.95, 0.88]]];
    x = -54;
    for (const [kind, c] of fb) {
      place(makeFallbackProp(kind, c, { seed: 7 }), x, Y, -92, 1.6);
      x += 6;
    }
    for (const n of [104, 101, 102, 119, 105, 128]) {
      const cat = getCatalogEntry(n);
      if (!cat) continue;
      const entry: any = { accessNumber: cat.accessNumber, name: cat.name, archetype: cat.archetype, colorRgb: cat.colorRgb, scaleMultiplier: 1 };
      if (cat.stemColorRgb) entry.stemColorRgb = cat.stemColorRgb;
      const set = buildVegStages(entry, () => new MeshAcc());
      for (const st of [0, 2]) {
        const holder = global.scene.createSceneObject("Gal_Veg_" + n + "_" + st);
        const cols = [set.bodyRgb, set.accentRgb, set.detailRgb];
        for (let i = 0; i < 3; i++) {
          const p = set.parts[st][i];
          if (!p || p.count() === 0) continue;
          meshObj(holder, ["Body", "Accent", "Detail"][i], p, itemMat(cols[i], set.rough, set.metal, 0.12));
        }
        place(holder, x, Y, -92 + (st === 2 ? 6 : 0), 2.2);
      }
      print(`[AssetGallery] veg ${n} ${set.gen} tris=${set.tris.join("/")}`);
      x += 7;
    }

    print("[AssetGallery] HOLD gallery visible");
    if (hold > 0) await sleep(hold * 1000);
    root.destroy();
    await sleep(100);
    print("[LEAF] AssetGalleryScenario PASSED");
  }
}
