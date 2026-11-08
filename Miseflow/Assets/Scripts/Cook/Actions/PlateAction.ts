/**
 * PLATE: finished food moves from wherever it is onto the plate along lifted arcs (staggered), piling into a mound;
 * flat items (chapathi discs) stack. The tool follows the piece in flight. Works for any dish (not salmon-specific).
 */
import {
  CookAction, CookActionContext, alive, allPieces, arcPoint, bottomOffset, clamp01, discSpots, heightOf, itemsByRole, placeTip, setWpos, smooth, tipWorld, toolHome, toolTilt,
  v3, wpos, SOLID_ROLES,
} from "./CookActionKit";
import { ItemHandle } from "../CookWorld";
import { flatPiece } from "./CookFlatAction";

export function plateFood(ctx: CookActionContext): ItemHandle[] {
  const garnish = ctx.world.plan && ctx.world.plan.garnishIds ? ctx.world.plan.garnishIds : [];
  let food = itemsByRole(ctx.items, SOLID_ROLES).filter((it) => garnish.indexOf(it.id) < 0 && it.role !== "GARNISH");
  if (food.length === 0) {
    const all: ItemHandle[] = [];
    for (const id in ctx.world.items) all.push(ctx.world.items[id]);
    food = itemsByRole(all, ["PROTEIN", "VEG", "DOUGH"]).filter((it) => garnish.indexOf(it.id) < 0);
  }
  return food;
}

export const PlateAction: CookAction = {
  name: "PLATE",
  run: async (ctx: CookActionContext) => {
    const plate = ctx.world.plate || ctx.to || ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(2, ctx.dur);
    const food = plateFood(ctx);
    const spot = ctx.world.platingSpot ? ctx.world.platingSpot() : plate.floorWorld();
    const flats = food.filter((it) => it.role === "DOUGH");
    const others = food.filter((it) => it.role !== "DOUGH");
    const objs: SceneObject[] = [];
    const dest: vec3[] = [];
    // stack flat items
    let y = spot.y;
    for (const it of flats) {
      const d = flatPiece(it);
      if (!alive(d)) continue;
      objs.push(d);
      dest.push(new vec3(spot.x, y + bottomOffset(d) + 0.02, spot.z));
      y += Math.max(0.12, heightOf(d) * 0.9);
    }
    // mound the pieces (centre ones sit higher)
    const pieces = allPieces(others);
    const R = Math.max(1, plate.radiusCm * 0.45);
    const spots = discSpots(spot, R, pieces.length, y);
    for (let i = 0; i < pieces.length; i++) {
      const r = Math.sqrt((spots[i].x - spot.x) ** 2 + (spots[i].z - spot.z) ** 2);
      objs.push(pieces[i]);
      dest.push(new vec3(spots[i].x, y + bottomOffset(pieces[i]) + 0.05 + (1 - r / R) * 0.9 * Math.min(1, pieces.length / 8), spots[i].z));
    }
    // food a fry step already carried onto the plate stays exactly where it was set down
    const pf = plate.floorWorld();
    for (let i = 0; i < objs.length; i++) {
      const c = wpos(objs[i]);
      if (Math.sqrt((c.x - pf.x) ** 2 + (c.z - pf.z) ** 2) < plate.radiusCm * 0.95 && c.y > pf.y - 0.5 && c.y < pf.y + 12) dest[i] = c;
    }
    const from = objs.map((o) => wpos(o));
    const n = objs.length;
    const hop = Math.max(0.5, Math.min(1.2, D * 0.35));
    const stagger = n > 1 ? Math.max(0.05, (D * 0.85 - hop) / (n - 1)) : 0;
    const total = hop + stagger * Math.max(0, n - 1);
    await ctx.tween(total, (k) => {
      const t = k * total;
      let lead = -1;
      for (let i = 0; i < n; i++) {
        const u = clamp01((t - i * stagger) / hop);
        if (u <= 0) continue;
        setWpos(objs[i], arcPoint(from[i], dest[i], 7, smooth(u)));
        if (u < 1) lead = i;
      }
      if (tool && lead >= 0) placeTip(tool, wpos(objs[lead]).add(v3(0, 0.9, 0)), toolTilt(tool, 30));
    });
    for (let i = 0; i < n; i++) setWpos(objs[i], dest[i]);
    void tipWorld;
    await toolHome(ctx, tool, 0.6);
  },
};
