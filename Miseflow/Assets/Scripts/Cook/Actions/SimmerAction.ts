/** SIMMER (and BOIL via simmerLike): liquid in, bubbles rise and pop, steam builds, food bobs, the ladle stirs. */
import {
  CookAction, CookActionContext, allPieces, avgRgb, bobPieces, FX, fxBubbles, gatherInto, heatOf, itemsByRole, levelY, rgbVec, splitItems, tipInto, toolCircles, toolHome,
} from "./CookActionKit";
import { HeatLevel } from "../CookWorld";

export function simmerLike(name: string, boil: boolean): CookAction {
  return {
    name: name,
    run: async (ctx: CookActionContext) => {
      const eq = ctx.equipment;
      const D = Math.max(2.5, ctx.dur);
      const def: HeatLevel = boil ? "HIGH" : "LOW";
      const h = heatOf(ctx.step, def);
      eq.setHeat(h === "OFF" ? def : h);
      const { solids, pantry } = splitItems(ctx.items);
      const liquids = itemsByRole(pantry, ["LIQUID", "DAIRY"]);
      const color = avgRgb(ctx, liquids.length > 0 ? liquids : pantry, boil ? FX.WATER : [0.92, 0.45, 0.2]);
      const level = 0.6;
      const fillUp = ctx.tween(Math.max(0.6, D * 0.2), (k) => eq.setFill(level * k, rgbVec(color)));
      if (pantry.length > 0) await Promise.all([fillUp, ...pantry.map((it, i) => ctx.wait(i * 0.15).then(() => tipInto(ctx, it, eq, Math.max(0.5, D * 0.2), it.role === "LIQUID")))]);
      else await fillUp;
      eq.setFill(level, rgbVec(color));
      const pieces = allPieces(solids);
      await gatherInto(ctx, pieces, eq, Math.max(0.5, D * 0.12), 0.5);
      const keys = solids.map((it) => ctx.state.getKey(it.id));
      const main = Math.max(1.5, D * 0.6);
      const steamTo = boil ? 0.9 : 0.45;
      await Promise.all([
        fxBubbles(ctx, eq, levelY(eq, level), main, boil ? 14 : 5, boil ? FX.STEAM : color, boil ? 0.22 : 0.17),
        bobPieces(ctx, pieces, main, boil ? 0.35 : 0.15, boil ? 2.2 : 1.0, boil ? 25 : 10),
        ctx.tween(main, (k) => {
          eq.setSteam(steamTo * Math.min(1, k * 2));
          for (let j = 0; j < solids.length; j++) ctx.state.advance(solids[j].id, keys[j] === "raw" || keys[j] === "marinated" ? "cooked" : "sauced", k);
        }),
        ctx.wait(main * 0.3).then(() => toolCircles(ctx, ctx.tool, eq.floorWorld(), eq.radiusCm * 0.4, 2, main * 0.45, 35, 0.6)),
      ]);
      eq.setSteam(steamTo * 0.6);
      await toolHome(ctx, ctx.tool, 0.5);
    },
  };
}

export const SimmerAction: CookAction = simmerLike("SIMMER", false);
