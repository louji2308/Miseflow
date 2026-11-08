/** MIX: ingredients tip into the bowl, the tool stirs round while the contents orbit with it; the batter level rises. */
import { CookAction, CookActionContext, allPieces, avgRgb, gatherInto, orbitPieces, rgbVec, splitItems, tipInto, toolCircles, toolHome } from "./CookActionKit";

export const MixAction: CookAction = {
  name: "MIX",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = ctx.dur;
    const { solids, pantry } = splitItems(ctx.items);
    const pieces = allPieces(solids);
    await gatherInto(ctx, pieces, eq, Math.max(0.5, D * 0.15), 0.5);
    const color = avgRgb(ctx, pantry.length > 0 ? pantry : ctx.items, [0.95, 0.88, 0.7]);
    for (let i = 0; i < pantry.length; i++) {
      await tipInto(ctx, pantry[i], eq, Math.max(0.5, (D * 0.3) / pantry.length), pantry[i].role === "LIQUID" || pantry[i].role === "OIL");
      eq.setFill(0.1 + (0.25 * (i + 1)) / pantry.length, rgbVec(color));
    }
    const f = eq.floorWorld();
    const turns = ctx.count(3, 8);
    const sec = Math.max(1.2, D * 0.45);
    await Promise.all([
      toolCircles(ctx, ctx.tool, f, eq.radiusCm * 0.45, turns, sec, 35, 0.4),
      orbitPieces(ctx, pieces, f, turns * 0.5, sec),
    ]);
    if (pantry.length > 0) eq.setFill(0.35, rgbVec(color));
    await toolHome(ctx, ctx.tool, 0.5);
  },
};
