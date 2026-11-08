/** SEASON: each spice comes over the vessel and is shaken in pinches, a fine rain of coloured grains falls in. */
import {
  CookAction, CookActionContext, alive, arcPoint, DEG, placeTip, fxDrops, horiz, itemRgb, itemsByRole, setWpos, setWrot, smooth, toolHome, toolTo, toolTilt, v3, wpos, wrot, Rgb3,
} from "./CookActionKit";

export const SeasonAction: CookAction = {
  name: "SEASON",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(1.5, ctx.dur);
    let spices = itemsByRole(ctx.items, ["SPICE", "GARNISH", "AROMATIC", "OIL", "LIQUID", "DAIRY"]);
    if (spices.length === 0) spices = ctx.items.slice(0, 3);
    const rim = eq.rimWorld();
    const f = eq.floorWorld();
    if (spices.length === 0) {
      const salt: Rgb3 = [0.97, 0.97, 0.95];
      if (ctx.tool) await toolTo(ctx, ctx.tool, rim.add(v3(0, 3, 0)), toolTilt(ctx.tool, 30), 0.4, 2);
      await fxDrops(ctx, rim.add(v3(0, 3, 0)), f, 14, salt, Math.max(1, D * 0.7), 0.1, 1.2);
      await toolHome(ctx, ctx.tool, 0.4);
      return;
    }
    const each = D / spices.length;
    for (const it of spices) {
      const o = it.obj;
      if (!alive(o)) continue;
      ctx.holdPose(o);
      const p0 = wpos(o);
      const r0 = wrot(o);
      const dir = horiz(p0.sub(rim));
      const over = rim.add(dir.uniformScale(eq.radiusCm * 0.3)).add(v3(0, 5, 0));
      const axis = horiz(v3(0, 1, 0).cross(dir));
      await ctx.tween(each * 0.25, (k) => setWpos(o, arcPoint(p0, over, 2.5, smooth(k))));
      const color = itemRgb(ctx, it);
      const pinches = 3;
      const tool = ctx.tool;
      const brushR = eq.radiusCm * 0.45;
      await Promise.all([
        // a brush / spoon spreads it over the surface while it goes on
        tool ? toolTo(ctx, tool, f.add(v3(-brushR, 0.4, 0)), toolTilt(tool, 35), each * 0.1, 2).then(() =>
          ctx.tween(each * 0.4, (k) => placeTip(tool, f.add(v3(-brushR + 2 * brushR * k, 0.35 + 0.15 * Math.abs(Math.sin(k * Math.PI * 6)), Math.sin(k * Math.PI * 6) * brushR * 0.5)), toolTilt(tool, 35)))) : ctx.wait(0.01),
        fxDrops(ctx, over.add(v3(0, -0.5, 0)), f, 12, color, each * 0.5, 0.09, eq.radiusCm * 0.5),
        ctx.tween(each * 0.5, (k) => {
          const shake = Math.sin(k * Math.PI * 2 * pinches);
          setWrot(o, quat.angleAxis((-35 - 20 * Math.max(0, shake)) * DEG, axis).multiply(r0));
          setWpos(o, over.add(v3(0, 0.4 * Math.max(0, shake), 0)));
        }),
      ]);
      await ctx.tween(each * 0.25, (k) => {
        const e = smooth(k);
        setWrot(o, quat.slerp(quat.angleAxis(-35 * DEG, axis), quat.quatIdentity(), e).multiply(r0));
        setWpos(o, arcPoint(over, p0, 2.5, e));
      });
    }
    await toolHome(ctx, ctx.tool, 0.4);
  },
};
