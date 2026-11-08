/** COAT: flour is tipped into the bowl, each piece hops in, rolls through it (white puff) and hops back out coated. */
import {
  CookAction, CookActionContext, advanceAll, allPieces, arcPoint, bottomOffset, clamp01, DEG, discSpots, fxBurst, FX, itemsByRole, itemsNotRole, rgbVec, setWpos, setWrot,
  smooth, tipInto, toolCircles, toolHome, v3, wpos, wrot, SOLID_ROLES,
} from "./CookActionKit";

export const CoatAction: CookAction = {
  name: "COAT",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = ctx.dur;
    const coats = itemsNotRole(ctx.items, SOLID_ROLES);
    let food = itemsByRole(ctx.items, SOLID_ROLES);
    if (food.length === 0) food = ctx.items.slice(0, 1);
    for (const c of coats) await tipInto(ctx, c, eq, Math.max(0.5, (D * 0.18) / coats.length));
    eq.setFill(0.2, rgbVec(FX.FLOUR));
    const pieces = allPieces(food);
    const home = pieces.map((p) => wpos(p));
    const rot0 = pieces.map((p) => wrot(p));
    const f = eq.floorWorld();
    const spots = discSpots(f, eq.radiusCm * 0.45, pieces.length, f.y);
    const n = pieces.length;
    const sec = Math.max(1.6, D * 0.62);
    const hop = Math.min(0.9, sec / 3);
    const stagger = n > 1 ? (sec - hop * 2.6) / (n - 1) : 0;
    const out = ctx.to ? discSpots(ctx.to.floorWorld(), ctx.to.radiusCm * 0.5, n, ctx.to.floorWorld().y) : null;
    const puffed: boolean[] = pieces.map(() => false);
    const toolRun = toolCircles(ctx, ctx.tool, f, eq.radiusCm * 0.3, Math.max(2, Math.round(sec / 1.2)), sec, 45, 0.5);
    await Promise.all([
      toolRun,
      ctx.tween(sec, (k) => {
        const t = k * sec;
        for (let i = 0; i < n; i++) {
          const u = (t - i * Math.max(0, stagger)) / hop;
          const inBowl = new vec3(spots[i].x, f.y + bottomOffset(pieces[i]) + 0.25, spots[i].z);
          const dest = out ? new vec3(out[i].x, out[i].y + bottomOffset(pieces[i]) + 0.05, out[i].z) : home[i];
          if (u <= 0) continue;
          if (u < 1) setWpos(pieces[i], arcPoint(home[i], inBowl, 3.5, smooth(u)));
          else if (u < 1.6) {
            const r = (u - 1) / 0.6;
            if (!puffed[i]) {
              puffed[i] = true;
              void fxBurst(ctx, inBowl, 6, FX.FLOUR, 1.2, 1.4, 0.6, 0.13).catch(() => {});
            }
            setWpos(pieces[i], inBowl.add(v3(Math.sin(r * Math.PI * 2) * 0.4, 0.2 * Math.sin(r * Math.PI), 0)));
            setWrot(pieces[i], quat.angleAxis(360 * DEG * r, v3(0, 0, 1)).multiply(rot0[i]));
          } else {
            const r = clamp01((u - 1.6) / 1.0);
            setWrot(pieces[i], rot0[i]);
            setWpos(pieces[i], arcPoint(inBowl, dest, 3.5, smooth(r)));
          }
        }
        advanceAll(ctx, food, "coated", clamp01(k * 1.15));
      }),
    ]);
    advanceAll(ctx, food, "coated", 1);
    await toolHome(ctx, ctx.tool, 0.4);
  },
};
