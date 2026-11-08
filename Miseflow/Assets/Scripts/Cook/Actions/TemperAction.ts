/** TEMPER: a small pan of smoking oil; curry leaves / chillies / seeds drop in, sizzle (spits, steam burst) and darken. */
import {
  CookAction, CookActionContext, allPieces, arcPoint, bottomOffset, clamp01, DEG, discSpots, FX, fxBurst, heatOf, levelY, setWpos, setWrot, smooth, toolCircles, toolHome, v3,
  wpos, wrot,
} from "./CookActionKit";

export const TemperAction: CookAction = {
  name: "TEMPER",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(2.5, ctx.dur);
    eq.setHeat(heatOf(ctx.step, "HIGH") === "OFF" ? "HIGH" : heatOf(ctx.step, "HIGH"));
    const oilUp = Math.max(0.5, D * 0.15);
    await ctx.tween(oilUp, (k) => eq.setOil(0.25 * k, 0.3 * k));
    const f = eq.floorWorld();
    const surf = levelY(eq, 0.25);
    const items = ctx.items.filter((it) => it.role !== "OIL");
    const pieces = allPieces(items);
    const spots = discSpots(f, eq.radiusCm * 0.55, pieces.length, surf);
    const start = pieces.map((p) => wpos(p));
    const rot0 = pieces.map((p) => wrot(p));
    const dest = pieces.map((p, i) => new vec3(spots[i].x, Math.max(surf, f.y + bottomOffset(p)), spots[i].z));
    const dropSec = Math.max(1, D * 0.35);
    const each = dropSec / Math.max(1, pieces.length);
    const hit = pieces.map(() => false);
    let sizzle = 0;
    await ctx.tween(dropSec, (k) => {
      const t = k * dropSec;
      for (let i = 0; i < pieces.length; i++) {
        const u = clamp01((t - i * each * 0.7) / Math.max(0.25, each * 1.4));
        if (u <= 0) continue;
        setWpos(pieces[i], arcPoint(start[i], dest[i], 4, smooth(u)));
        if (u >= 1 && !hit[i]) {
          hit[i] = true;
          sizzle = 1;
          void fxBurst(ctx, dest[i], 6, FX.SPARK, 1.6, 1.2, 0.45, 0.1).catch(() => {});
        }
      }
      sizzle = Math.max(0, sizzle - 0.04);
      eq.setOil(0.25, 0.35 + 0.65 * sizzle);
      eq.setSteam(0.25 + 0.75 * sizzle);
    });
    // sizzle: pieces jitter and darken while the tool swirls the pan
    const fry = Math.max(1, D * 0.45);
    await Promise.all([
      toolCircles(ctx, ctx.tool, f, eq.radiusCm * 0.35, 2, fry, 40, 0.3),
      ctx.tween(fry, (k) => {
        const env = 1 - k * 0.6;
        eq.setOil(0.25, 0.4 + 0.5 * env);
        eq.setSteam(0.3 + 0.5 * env * (0.6 + 0.4 * Math.sin(k * 30)));
        for (let i = 0; i < pieces.length; i++) {
          const j = 0.08 * env;
          setWpos(pieces[i], dest[i].add(v3(Math.sin(k * 61 + i) * j, Math.abs(Math.sin(k * 47 + i * 2)) * j * 1.5, Math.cos(k * 53 + i) * j)));
          setWrot(pieces[i], quat.angleAxis(Math.sin(k * 40 + i) * 8 * DEG * env, v3(0, 1, 0)).multiply(rot0[i]));
        }
        for (const it of items) ctx.state.advance(it.id, "fried", k);
      }),
    ]);
    for (let i = 0; i < pieces.length; i++) setWpos(pieces[i], dest[i]);
    eq.setOil(0.25, 0.35);
    eq.setSteam(0.3);
    await toolHome(ctx, ctx.tool, 0.4);
  },
};
