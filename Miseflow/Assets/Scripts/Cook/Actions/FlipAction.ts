/**
 * FLIP: the spatula slides in flat under the food, lifts, and the food turns 180 deg over the blade (small hop) and
 * lands cooked side up; the spatula returns (SpatulaTechniqueGuide.playFlip idea, generic for any piece / disc).
 */
import {
  CookAction, CookActionContext, alive, allPieces, bottomOffset, DEG, horiz, placeTip, rotateAbout, setWpos, smooth, toolAxis, toolHome, toolTilt, toolTo, v3, wpos, wrot,
  SOLID_ROLES, itemsByRole,
} from "./CookActionKit";
import { worldAabb } from "../../KineRegistry";
import { flatPiece } from "./CookFlatAction";

export const FlipAction: CookAction = {
  name: "FLIP",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(1.5, ctx.dur);
    let food = itemsByRole(ctx.items, SOLID_ROLES);
    if (food.length === 0) food = ctx.items.slice();
    const dough = itemsByRole(food, ["DOUGH"]);
    const targets: SceneObject[] = dough.length > 0 ? [flatPiece(dough[0])] : allPieces(food).slice(0, 10);
    const f = eq.floorWorld();
    const axis = tool ? toolAxis(tool) : v3(1, 0, 0);
    const slide = horiz(v3(0, 1, 0).cross(axis));
    const each = D / Math.max(1, targets.length);
    for (const p of targets) {
      if (!alive(p)) continue;
      const p0 = wpos(p);
      const r0 = wrot(p);
      const b = worldAabb(p);
      const centre = b ? b.mn.add(b.mx).uniformScale(0.5) : p0;
      const width = b ? Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z) : 1;
      const under = new vec3(centre.x, f.y + 0.08, centre.z);
      const flat = tool ? toolTilt(tool, -4) : quat.quatIdentity();
      if (tool) {
        await toolTo(ctx, tool, under.sub(slide.uniformScale(width * 0.5 + 1.5)).add(v3(0, 0.6, 0)), flat, each * 0.2, 2);
        await toolTo(ctx, tool, under, flat, each * 0.15, 0);
      }
      const hop = 2 + width * 0.25;
      await ctx.tween(each * 0.45, (k) => {
        const e = smooth(k);
        const lift = Math.sin(Math.PI * k) * hop;
        rotateAbout(p, centre.add(v3(0, lift, 0)), quat.angleAxis(180 * DEG * e, axis), p0.add(v3(0, lift, 0)), r0);
        if (tool) placeTip(tool, under.add(v3(0, lift * 0.45, 0)), toolTilt(tool, -4 - 25 * Math.sin(Math.PI * Math.min(1, k * 1.6))));
      });
      // settle the bottom back on the surface (the origin moved when it turned over)
      const nb = worldAabb(p);
      if (nb) {
        const dy = f.y + 0.03 - nb.mn.y;
        const c = wpos(p);
        await ctx.tween(0.12, (k) => setWpos(p, c.add(v3(0, dy * k, 0))));
      }
      if (tool) await toolTo(ctx, tool, under.sub(slide.uniformScale(width * 0.5 + 1.5)).add(v3(0, 0.8, 0)), flat, each * 0.15, 0.5);
    }
    for (const it of food) {
      const key = ctx.state.getKey(it.id);
      if (it.role === "DOUGH") ctx.state.advance(it.id, "toasted", 1);
      else if (key === "raw" || key === "marinated" || key === "coated") ctx.state.advance(it.id, "cooked", 1);
    }
    void bottomOffset;
    await toolHome(ctx, tool, 0.5);
  },
};
