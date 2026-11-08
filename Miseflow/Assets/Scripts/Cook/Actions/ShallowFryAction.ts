/** SHALLOW_FRY: a thin film of oil, pieces laid in one layer (sizzle), fried, flipped one by one, fried again. */
import {
  CookAction, CookActionContext, advanceAll, allPieces, bottomOffset, DEG, FX, fxBubbles, fxBurst, gatherInto, heatOf, itemsByRole, levelY, placeTip, rotateAbout, setWpos,
  smooth, toolHome, toolTilt, toolTo, v3, wpos, wrot, SOLID_ROLES,
} from "./CookActionKit";

export const ShallowFryAction: CookAction = {
  name: "SHALLOW_FRY",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(3, ctx.dur);
    let food = itemsByRole(ctx.items, SOLID_ROLES);
    if (food.length === 0) food = ctx.items.slice();
    const pieces = allPieces(food);
    eq.setHeat(heatOf(ctx.step, "MED") === "OFF" ? "MED" : heatOf(ctx.step, "MED"));
    eq.setOil(0.18, 0.3);
    await gatherInto(ctx, pieces, eq, Math.max(0.6, D * 0.15), 0.62, 0.05);
    const surf = levelY(eq, 0.18);
    void fxBurst(ctx, eq.floorWorld().add(v3(0, 0.3, 0)), 10, FX.OIL, 1.2, eq.radiusCm * 0.5, 0.7, 0.12).catch(() => {});
    const side = Math.max(1, D * 0.3);
    await Promise.all([
      fxBubbles(ctx, eq, surf, side, 6, FX.OIL, 0.12),
      ctx.tween(side, (k) => {
        eq.setOil(0.18, 0.7);
        advanceAll(ctx, food, "fried", 0.5 * k);
      }),
    ]);
    // flip each piece over (spatula under, roll 180 deg with a small hop)
    const flipSec = Math.max(0.35, (D * 0.3) / Math.max(1, pieces.length));
    for (const p of pieces) {
      const p0 = wpos(p);
      const r0 = wrot(p);
      const h = bottomOffset(p);
      const pivot = p0.add(v3(0, h * 0.5, 0));
      if (tool) await toolTo(ctx, tool, p0.add(v3(-0.8, 0.1, 0)), toolTilt(tool, -6), flipSec * 0.35, 1);
      await ctx.tween(flipSec * 0.65, (k) => {
        const e = smooth(k);
        const hop = Math.sin(Math.PI * k) * 1.6;
        rotateAbout(p, pivot.add(v3(0, hop, 0)), quat.angleAxis(180 * DEG * e, v3(0, 0, 1)), p0.add(v3(0, hop, 0)), r0);
        if (tool) placeTip(tool, p0.add(v3(-0.4, 0.1 + hop * 0.6, 0)), toolTilt(tool, -6 - 20 * Math.sin(Math.PI * k)));
      });
      setWpos(p, new vec3(p0.x, eq.floorWorld().y + bottomOffset(p) + 0.05, p0.z));
    }
    await Promise.all([
      fxBubbles(ctx, eq, surf, side, 6, FX.OIL, 0.12),
      ctx.tween(side, (k) => advanceAll(ctx, food, "fried", 0.5 + 0.5 * k)),
    ]);
    eq.setOil(0.18, 0.25);
    await toolHome(ctx, tool, 0.5);
  },
};
