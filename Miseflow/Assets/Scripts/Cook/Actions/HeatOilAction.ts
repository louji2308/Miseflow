/** HEAT_OIL: burner on, oil streams in and the level rises, then the surface starts to shimmer and bubble. */
import { CookAction, CookActionContext, FX, fxBubbles, heatOf, itemsByRole, levelY, tipInto } from "./CookActionKit";

/** Deep-frying depth (fraction of the vessel depth, see levelY): oil climbs the wall but stays well below the rim. */
export const OIL_LEVEL = 0.72;

export const HeatOilAction: CookAction = {
  name: "HEAT_OIL",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = ctx.dur;
    eq.setHeat(heatOf(ctx.step, "HIGH") === "OFF" ? "HIGH" : heatOf(ctx.step, "HIGH"));
    const oils = itemsByRole(ctx.items, ["OIL"]);
    const pour = Math.max(0.8, D * 0.4);
    const rise = ctx.tween(pour, (k) => eq.setOil(OIL_LEVEL * k, 0));
    if (oils.length > 0) await Promise.all([rise, tipInto(ctx, oils[0], eq, pour, true)]);
    else await rise;
    eq.setOil(OIL_LEVEL, 0);
    const heat = Math.max(1, D * 0.55);
    await Promise.all([
      ctx.tween(heat, (k) => eq.setOil(OIL_LEVEL, 0.35 * k * k)),
      fxBubbles(ctx, eq, levelY(eq, OIL_LEVEL), heat, 4, FX.OIL, 0.14),
    ]);
    eq.setOil(OIL_LEVEL, 0.3);
  },
};
