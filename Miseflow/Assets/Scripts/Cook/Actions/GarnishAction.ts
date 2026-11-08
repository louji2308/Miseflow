/**
 * GARNISH: garnish items (step ingredients + plan garnishIds) rise over the plate and are sprinkled onto the top of
 * the plated food, tumbling as they fall; a single whole garnish (lemon wedge) is set on the plate's edge.
 */
import { CookAction, CookActionContext, alive, arcPoint, bottomOffset, clamp01, DEG, easeIn, piecesOf, rng, hashStr, setWpos, setWrot, smooth, topY, v3, wpos, wrot } from "./CookActionKit";
import { ItemHandle } from "../CookWorld";

export const GarnishAction: CookAction = {
  name: "GARNISH",
  run: async (ctx: CookActionContext) => {
    const plate = ctx.world.plate || ctx.to || ctx.equipment;
    const D = Math.max(1.5, ctx.dur);
    const ids: string[] = [];
    for (const it of ctx.items) if (ids.indexOf(it.id) < 0) ids.push(it.id);
    const plan = ctx.world.plan;
    if (plan && plan.garnishIds) for (const id of plan.garnishIds) if (ids.indexOf(id) < 0 && ctx.world.items[id]) ids.push(id);
    const items: ItemHandle[] = ids.map((id) => ctx.world.items[id]).filter((it) => !!it);
    const spot = ctx.world.platingSpot ? ctx.world.platingSpot() : plate.floorWorld();
    // top of whatever is already on the plate
    const onPlate: SceneObject[] = [];
    for (const id in ctx.world.items) {
      if (ids.indexOf(id) >= 0) continue;
      for (const p of piecesOf(ctx.world.items[id])) {
        const w = wpos(p);
        if (Math.sqrt((w.x - spot.x) ** 2 + (w.z - spot.z) ** 2) < plate.radiusCm) onPlate.push(p);
      }
    }
    const top = topY(onPlate, spot.y);
    const r = rng(hashStr(ctx.step.id + "g"));
    const objs: SceneObject[] = [];
    const dest: vec3[] = [];
    const spin: number[] = [];
    for (let j = 0; j < items.length; j++) {
      const ps = piecesOf(items[j]);
      if (ps.length === 1 && (!items[j].pieces || items[j].pieces.length === 0)) {
        // whole garnish: rest on the plate edge
        const a = -0.6 + j * 0.9;
        const rr = plate.radiusCm * 0.68;
        objs.push(ps[0]);
        dest.push(new vec3(spot.x + Math.cos(a) * rr, spot.y + bottomOffset(ps[0]) + 0.05, spot.z + Math.sin(a) * rr));
        spin.push(0);
        continue;
      }
      for (const p of ps) {
        if (!alive(p)) continue;
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * plate.radiusCm * 0.35;
        objs.push(p);
        dest.push(new vec3(spot.x + Math.cos(a) * d, top + 0.05 + r() * 0.2, spot.z + Math.sin(a) * d));
        spin.push(180 + r() * 360);
      }
    }
    const from = objs.map((o) => wpos(o));
    const rot0 = objs.map((o) => wrot(o));
    const n = objs.length;
    const fly = Math.max(0.6, D * 0.45);
    const stagger = n > 1 ? (D * 0.9 - fly) / (n - 1) : 0;
    const total = fly + Math.max(0, stagger) * Math.max(0, n - 1);
    await ctx.tween(Math.max(0.3, total), (k) => {
      const t = k * total;
      for (let i = 0; i < n; i++) {
        const u = clamp01((t - i * Math.max(0, stagger)) / fly);
        if (u <= 0) continue;
        const over = new vec3(dest[i].x, Math.max(dest[i].y, top) + 4, dest[i].z);
        if (u < 0.6) setWpos(objs[i], arcPoint(from[i], over, 3, smooth(u / 0.6)));
        else setWpos(objs[i], over.add(dest[i].sub(over).uniformScale(easeIn((u - 0.6) / 0.4))));
        if (spin[i] !== 0) setWrot(objs[i], quat.angleAxis(spin[i] * DEG * u, v3(0.3, 1, 0.2).normalize()).multiply(rot0[i]));
      }
    });
    for (let i = 0; i < n; i++) setWpos(objs[i], dest[i]);
  },
};
