/**
 * DEEP_FRY: `count` batches. Pieces drop into the hot oil one by one (splash, bubbling surges), fry while the oil
 * boils hard and the food goes golden-brown, then the skimmer scoops the batch out and sets it down to rest.
 */
import {
  CookAction, CookActionContext, advanceAll, allPieces, arcPoint, besideSpot, bottomOffset, clamp01, discSpots, FX, fxBubbles, fxBurst, fxDrops, heatOf, itemsByRole,
  levelY, placeTip, setWpos, setWrot, smooth, tipWorld, toolHome, toolTilt, toolTo, v3, wpos, wrot, DEG, SOLID_ROLES,
} from "./CookActionKit";
import { OIL_LEVEL } from "./HeatOilAction";

export const DeepFryAction: CookAction = {
  name: "DEEP_FRY",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(4, ctx.dur);
    let food = itemsByRole(ctx.items, SOLID_ROLES);
    if (food.length === 0) food = ctx.items.slice();
    const pieces = allPieces(food);
    const n = pieces.length;
    const batches = Math.max(1, Math.min(n, ctx.count(2, 4)));
    const per = Math.ceil(n / batches);
    eq.setHeat(heatOf(ctx.step, "HIGH") === "OFF" ? "HIGH" : heatOf(ctx.step, "HIGH"));
    eq.setOil(OIL_LEVEL, 0.3);
    const f = eq.floorWorld();
    const rim = eq.rimWorld();
    const surf = levelY(eq, OIL_LEVEL);
    const bSec = D / batches;
    let rested = 0;
    // rest the fried food on the side of the vessel with more free bench
    let side = 1;
    if (!ctx.to) {
      const clear = (sg: number): number => {
        const c = besideSpot(eq, 0, 1, sg);
        let m = 1e9;
        for (const id in ctx.world.equipment) {
          const o = ctx.world.equipment[id];
          if (o === eq) continue;
          const fo = o.floorWorld();
          m = Math.min(m, Math.sqrt((fo.x - c.x) ** 2 + (fo.z - c.z) ** 2) - o.radiusCm);
        }
        return m;
      };
      side = clear(1) >= clear(-1) ? 1 : -1;
    }
    for (let b = 0; b < batches; b++) {
      const group = pieces.slice(b * per, Math.min(n, (b + 1) * per));
      if (group.length === 0) continue;
      // 1. drop one by one
      const start = group.map((p) => wpos(p));
      const rot0 = group.map((p) => wrot(p));
      const spots = discSpots(f, eq.radiusCm * 0.45, group.length, surf);
      const inOil = group.map((p, i) => new vec3(spots[i].x, surf - Math.min(0.6, bottomOffset(p) * 0.6), spots[i].z));
      const dropSec = Math.max(0.8, bSec * 0.28);
      const each = dropSec / group.length;
      const splashed = group.map(() => false);
      await ctx.tween(dropSec, (k) => {
        const t = k * dropSec;
        let landed = 0;
        for (let i = 0; i < group.length; i++) {
          const u = clamp01((t - i * each) / Math.max(0.2, each * 1.6));
          if (u <= 0) continue;
          const over = new vec3(inOil[i].x, rim.y + 3, inOil[i].z);
          if (u < 0.7) setWpos(group[i], arcPoint(start[i], over, 2.5, smooth(u / 0.7)));
          else setWpos(group[i], over.add(inOil[i].sub(over).uniformScale(((u - 0.7) / 0.3) ** 2)));
          if (u >= 1) {
            landed++;
            if (!splashed[i]) {
              splashed[i] = true;
              void fxBurst(ctx, inOil[i], 5, FX.OIL, 1.4, 1.0, 0.5, 0.12).catch(() => {});
            }
          }
        }
        eq.setOil(OIL_LEVEL, Math.min(1, 0.4 + 0.6 * (landed / group.length)));
      });
      // 2. fry: hard bubbling, pieces bob and turn, colour to golden
      const fry = Math.max(1.2, bSec * 0.45);
      await Promise.all([
        fxBubbles(ctx, eq, surf, fry, 10, FX.OIL, 0.16),
        ctx.tween(fry, (k) => {
          eq.setOil(OIL_LEVEL, 0.95 - 0.15 * k);
          for (let i = 0; i < group.length; i++) {
            const ph = i * 1.3 + b;
            setWpos(group[i], inOil[i].add(v3(Math.sin(k * 9 + ph) * 0.15, Math.sin(k * 14 + ph) * 0.12, Math.cos(k * 7 + ph) * 0.15)));
            setWrot(group[i], quat.angleAxis(k * 200 * DEG + ph, v3(Math.sin(ph), 0.4, Math.cos(ph)).normalize()).multiply(rot0[i]));
          }
          advanceAll(ctx, food, "fried", (b + k) / batches);
        }),
      ]);
      // 3. skimmer scoops the batch out and sets it down to rest
      const lift = Math.max(1, bSec * 0.27);
      const c = f.add(v3(0, 0, 0));
      const under = new vec3(c.x, surf - 0.4, c.z);
      const restAt = group.map((_p, i) => {
        const s = ctx.to ? discSpots(ctx.to.floorWorld(), ctx.to.radiusCm * 0.5, n, ctx.to.floorWorld().y)[rested + i] : besideSpot(eq, rested + i, n, side);
        return new vec3(s.x, s.y + bottomOffset(group[i]) + 0.05, s.z);
      });
      const off = group.map((_p, i) => inOil[i].sub(under));
      if (tool) {
        await toolTo(ctx, tool, under, toolTilt(tool, 25), lift * 0.25, 3);
        const above = new vec3(c.x, rim.y + 4, c.z);
        const restC = restAt[0].add(v3(0, 3, 0));
        const drip = fxDrops(ctx, above, new vec3(c.x, surf, c.z), 6, FX.OIL, lift * 0.45, 0.12, 0.8).catch(() => {});
        await ctx.tween(lift * 0.5, (k) => {
          const p = k < 0.45 ? under.add(above.sub(under).uniformScale(smooth(k / 0.45))) : arcPoint(above, restC, 2, smooth((k - 0.45) / 0.55));
          placeTip(tool, p, toolTilt(tool, 25));
          const tip = tipWorld(tool);
          for (let i = 0; i < group.length; i++) setWpos(group[i], tip.add(off[i].uniformScale(0.5)).add(v3(0, 0.3, 0)));
        });
        await drip;
        const from = group.map((p) => wpos(p));
        await ctx.tween(lift * 0.25, (k) => {
          for (let i = 0; i < group.length; i++) setWpos(group[i], arcPoint(from[i], restAt[i], 1, smooth(k)));
        });
      } else {
        const from = group.map((p) => wpos(p));
        await ctx.tween(lift, (k) => {
          for (let i = 0; i < group.length; i++) setWpos(group[i], arcPoint(from[i], restAt[i], 5, smooth(k)));
        });
      }
      for (let i = 0; i < group.length; i++) setWrot(group[i], rot0[i]);
      rested += group.length;
      eq.setOil(OIL_LEVEL, 0.35);
    }
    advanceAll(ctx, food, "fried", 1);
    await toolHome(ctx, tool, 0.5);
    eq.setOil(OIL_LEVEL, 0.3);
  },
};
