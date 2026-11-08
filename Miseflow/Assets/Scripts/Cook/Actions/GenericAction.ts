/** GENERIC: fallback for unknown / unimplemented actions; the tool circles over the vessel for the step's duration. */
import { CookAction, CookActionContext, allPieces, bobPieces, toolCircles, toolHome, v3 } from "./CookActionKit";

export const GenericAction: CookAction = {
  name: "GENERIC",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(1, ctx.dur);
    const pieces = allPieces(ctx.items).filter((p) => {
      const w = p.getTransform().getWorldPosition();
      const f = eq.floorWorld();
      return Math.sqrt((w.x - f.x) ** 2 + (w.z - f.z) ** 2) <= eq.radiusCm * 1.1;
    });
    const sec = Math.max(0.8, D - 0.6);
    await Promise.all([
      toolCircles(ctx, ctx.tool, eq.rimWorld().add(v3(0, 1.2, 0)), Math.max(0.8, eq.radiusCm * 0.45), Math.max(1, Math.round(sec / 1.5)), sec, 30, 0),
      bobPieces(ctx, pieces, sec, 0.12, 0.8),
    ]);
    await toolHome(ctx, ctx.tool, 0.5);
  },
};
