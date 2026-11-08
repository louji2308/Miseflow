/** WHISK: the whisk beats fast tight circles then figure-eights, the mixture lightens and froths with small bubbles. */
import {
  CookAction, CookActionContext, avgRgb, FX, fxBubbles, levelY, mix3, placeTip, rgbVec, splitItems, tipInto, toolHome, toolTilt, toolTo, v3,
} from "./CookActionKit";

export const WhiskAction: CookAction = {
  name: "WHISK",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(2, ctx.dur);
    const { pantry } = splitItems(ctx.items);
    for (const it of pantry) await tipInto(ctx, it, eq, Math.max(0.5, (D * 0.25) / pantry.length), it.role === "LIQUID" || it.role === "DAIRY");
    const base = avgRgb(ctx, pantry.length > 0 ? pantry : ctx.items, [0.98, 0.86, 0.5]);
    const light = mix3(base, [1, 1, 0.95], 0.4);
    eq.setFill(0.3, rgbVec(base));
    const f = eq.floorWorld();
    const r = eq.radiusCm * 0.3;
    const turns = ctx.count(12, 30);
    const sec = Math.max(1.5, D * 0.7);
    if (tool) await toolTo(ctx, tool, f.add(v3(r, 0.5, 0)), toolTilt(tool, 55), 0.4, 3);
    await Promise.all([
      fxBubbles(ctx, eq, levelY(eq, 0.36), sec, 6, FX.STEAM, 0.12),
      ctx.tween(sec, (k) => {
        const a = turns * Math.PI * 2 * k;
        const eight = k > 0.66;
        const x = eight ? Math.sin(a) * r * 1.3 : Math.cos(a) * r;
        const z = eight ? Math.sin(a * 2) * r * 0.6 : Math.sin(a) * r;
        if (tool) placeTip(tool, f.add(v3(x, 0.5 + 0.2 * Math.sin(a * 3), z)), quat.angleAxis(Math.sin(a) * 0.25, v3(0, 1, 0)).multiply(toolTilt(tool, 55)));
        eq.setFill(0.3 + 0.08 * k, rgbVec(mix3(base, light, k)));
      }),
    ]);
    await toolHome(ctx, tool, 0.5);
  },
};
