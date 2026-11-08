/** STEAM_DUM: low heat, the vessel is sealed and steam builds to a full plume, the food swells softly, then a release. */
import { CookAction, CookActionContext, allPieces, avgRgb, bobPieces, FX, fxBurst, gatherInto, heatOf, itemsByRole, rgbVec, splitItems, tipInto, toolCircles, toolHome, v3 } from "./CookActionKit";

export const SteamDumAction: CookAction = {
  name: "STEAM_DUM",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(3, ctx.dur);
    const h = heatOf(ctx.step, "LOW");
    eq.setHeat(h === "OFF" ? "LOW" : h);
    const { solids, pantry } = splitItems(ctx.items);
    const liquids = itemsByRole(pantry, ["LIQUID", "DAIRY"]);
    for (const it of liquids) await tipInto(ctx, it, eq, Math.max(0.5, (D * 0.15) / liquids.length), true);
    if (liquids.length > 0) eq.setFill(0.3, rgbVec(avgRgb(ctx, liquids, FX.WATER)));
    const pieces = allPieces(solids);
    await gatherInto(ctx, pieces, eq, Math.max(0.5, D * 0.12), 0.5);
    const build = Math.max(1.5, D * 0.6);
    const keys = solids.map((it) => ctx.state.getKey(it.id));
    ctx.onCleanup(() => {
      for (const it of solids) ctx.state.setGlow(it.id, 0);
    });
    await Promise.all([
      bobPieces(ctx, pieces, build, 0.1, 0.5),
      ctx.tween(build, (k) => {
        eq.setSteam(0.2 + 0.8 * k);
        for (let j = 0; j < solids.length; j++) {
          ctx.state.advance(solids[j].id, keys[j] === "raw" || keys[j] === "marinated" ? "cooked" : "sauced", k);
          ctx.state.setGlow(solids[j].id, 0.12 * Math.sin(Math.PI * k));
        }
      }),
    ]);
    // release: a burst of steam, the plume settles; the tool fluffs the contents once
    void fxBurst(ctx, eq.rimWorld().add(v3(0, 0.5, 0)), 12, FX.STEAM, 4, eq.radiusCm * 0.4, 1.2, 0.35).catch(() => {});
    await Promise.all([
      ctx.tween(Math.max(0.8, D * 0.2), (k) => eq.setSteam(1 - 0.6 * k)),
      toolCircles(ctx, ctx.tool, eq.floorWorld(), eq.radiusCm * 0.35, 1, Math.max(0.8, D * 0.2), 35, 0.6),
    ]);
    for (const it of solids) ctx.state.setGlow(it.id, 0);
    await toolHome(ctx, ctx.tool, 0.5);
  },
};
