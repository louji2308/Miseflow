/**
 * POUR: the `fromId` vessel lifts, moves beside the `toId` vessel and tilts; a stream arcs from its rim into the
 * target while the source empties and the target fills; any solid pieces of the step slide across along the arc.
 * Without a usable from/to pair the step's pantry items are tipped into the step vessel instead.
 */
import {
  CookAction, CookActionContext, allPieces, arcPoint, avgRgb, bottomOffset, clamp01, DEG, discSpots, FX, fxStream, horiz, rgbVec, rotateAbout, setWpos, smooth, splitItems,
  tipInto, v3, wpos, wrot,
} from "./CookActionKit";

export const PourAction: CookAction = {
  name: "POUR",
  run: async (ctx: CookActionContext) => {
    const D = Math.max(2, ctx.dur);
    const dst = ctx.to || ctx.equipment;
    const src = ctx.from && ctx.from !== dst ? ctx.from : ctx.to && ctx.equipment !== ctx.to ? ctx.equipment : null;
    const { solids, pantry } = splitItems(ctx.items);
    const color = avgRgb(ctx, pantry.length > 0 ? pantry : ctx.items, [0.95, 0.5, 0.2]);
    if (!src) {
      for (const it of pantry) await tipInto(ctx, it, dst, Math.max(0.6, D / Math.max(1, pantry.length)), true);
      dst.setFill(0.4, rgbVec(color));
      return;
    }
    const o = src.obj;
    ctx.holdPose(o);
    const p0 = wpos(o);
    const r0 = wrot(o);
    const toDst = horiz(dst.rimWorld().sub(src.rimWorld()));
    const dRim = dst.rimWorld();
    const lip = src.rimWorld().sub(p0);
    // place the source so its rim sits just outside the target rim, raised
    const goal = new vec3(dRim.x, Math.max(p0.y, dRim.y) + 5, dRim.z).sub(toDst.uniformScale(dst.radiusCm + src.radiusCm * 0.6 + 1)).sub(new vec3(0, lip.y, 0));
    const tilt = quat.angleAxis(-62 * DEG, horiz(v3(0, 1, 0).cross(toDst)));
    const move = Math.max(0.6, D * 0.2);
    await ctx.tween(move, (k) => setWpos(o, arcPoint(p0, goal, 3, smooth(k))));
    await ctx.tween(Math.max(0.4, D * 0.12), (k) => rotateAbout(o, goal, quat.slerp(quat.quatIdentity(), tilt, smooth(k)), goal, r0));
    const pourSec = Math.max(1, D * 0.4);
    const pieces = allPieces(solids);
    const pf = pieces.map((p) => wpos(p));
    const f = dst.floorWorld();
    const spots = discSpots(f, dst.radiusCm * 0.5, pieces.length, f.y);
    const pt = pieces.map((p, i) => new vec3(spots[i].x, f.y + bottomOffset(p) + 0.1, spots[i].z));
    await Promise.all([
      fxStream(ctx, () => src.rimWorld().add(toDst.uniformScale(src.radiusCm * 0.8)), f.add(v3(0, 0.3, 0)), 1.0, pourSec, color, 0.26, 14),
      ctx.tween(pourSec, (k) => {
        src.setFill(0.5 * (1 - k), rgbVec(color));
        dst.setFill(0.45 * k, rgbVec(color));
        for (let i = 0; i < pieces.length; i++) {
          const u = clamp01((k - (i / Math.max(1, pieces.length)) * 0.5) / 0.5);
          setWpos(pieces[i], arcPoint(pf[i], pt[i], 3, smooth(u)));
        }
      }),
    ]);
    const back = Math.max(0.6, D * 0.25);
    await ctx.tween(back, (k) => {
      const e = smooth(k);
      const q = quat.slerp(tilt, quat.quatIdentity(), Math.min(1, e * 2));
      const pos = arcPoint(goal, p0, 3, e);
      rotateAbout(o, pos, q, pos, r0);
    });
    setWpos(o, p0);
    o.getTransform().setWorldRotation(r0);
  },
};
