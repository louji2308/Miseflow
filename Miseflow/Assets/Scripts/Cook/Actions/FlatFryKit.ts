/**
 * FlatFryKit.ts  (Chef Director v6.2)
 *
 * Motions for FLAT food (poori, chapathi, dosa, fritter discs) that must never leave the vessel by accident:
 *  - flipInVessel: the tool slides under the disc, lifts it a little and turns it over about a horizontal axis through its centre
 *    (a disc that fits the vessel stays inside it for the whole turn); a disc found outside the vessel is first set into it.
 *  - deepFryFlat: ONE disc at a time: set into the oil, it puffs and floats on the surface, fries, is flipped, fries, and is lifted
 *    out with the tool, drained over the vessel and carried straight onto the plate. When the plan's next step for the item is a
 *    FLIP / another fry in the same vessel, the disc is left floating in the oil for that step.
 *  - liftToPlate: tool lifts the disc out of a vessel, drains, arcs over the plate and lowers it onto the stack.
 */
import {
  CookActionContext, advanceAll, alive, arcPoint, bottomOffset, clamp01, distFromAxis, FX, fxBubbles, fxBurst, fxDrops, heightOf, horiz, placeTip, rotateAbout,
  setWpos, setWrot, smooth, surfaceY, tipWorld, toolHome, toolTilt, toolTo, v3, wpos, wrot, DEG, clampToBench,
} from "./CookActionKit";
import { OIL_LEVEL } from "./HeatOilAction";
import { EquipmentHandle, ItemHandle, ToolHandle } from "../CookWorld";
import { worldAabb } from "../../KineRegistry";

/** A piece is flat when its footprint is much wider than it is tall (rolled disc). */
export function isFlatPiece(p: SceneObject): boolean {
  if ((p as any).__flat) return true; // stays flat food after it puffed up
  const b = worldAabb(p);
  if (!b) return false;
  const w = Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z);
  const h = Math.max(0.05, b.mx.y - b.mn.y);
  const flat = w / h > 2.2;
  if (flat) (p as any).__flat = true;
  return flat;
}

/**
 * The objects that move for a flat item: its pieces when it has several discs, else the item ROOT (the same object ROLL_DOUGH
 * flattened, COOK_FLAT / FLIP / PLATE move), so every step works on the same object.
 */
export function flatFryTargets(food: ItemHandle[]): SceneObject[] {
  const out: SceneObject[] = [];
  for (const it of food) {
    const ps = it.pieces.filter((p) => alive(p));
    if (ps.length > 1) for (const p of ps) out.push(p);
    else if (alive(it.obj)) out.push(it.obj);
  }
  return out;
}

/** Next step AFTER the current one that uses this item (by plan order), or null. */
export function nextUse(ctx: CookActionContext, itemId: string): { action: string; equipmentId: string } | null {
  const steps = ctx.world.plan && ctx.world.plan.steps ? ctx.world.plan.steps : [];
  let i0 = -1;
  for (let i = 0; i < steps.length; i++) if (steps[i].id === ctx.step.id) i0 = i;
  for (let i = i0 + 1; i0 >= 0 && i < steps.length; i++) {
    if ((steps[i].ingredientIds || []).indexOf(itemId) >= 0) return { action: String(steps[i].action).toUpperCase(), equipmentId: steps[i].equipmentId };
  }
  return null;
}

/** True when the piece sits inside the vessel (above its floor, below its rim, within its radius). */
export function inVessel(eq: EquipmentHandle, p: SceneObject): boolean {
  const pos = wpos(p);
  return distFromAxis(eq, pos) < eq.radiusCm * 0.95 && pos.y < eq.rimWorld().y + 0.5 && pos.y > eq.floorWorld().y - 0.3;
}

/** Sets the disc flat onto the surface of the vessel (carried by the tool when there is one). */
export async function setIntoVessel(ctx: CookActionContext, tool: ToolHandle | null, eq: EquipmentHandle, piece: SceneObject, sec: number, yScale: number = 1): Promise<void> {
  const f = eq.floorWorld();
  const rim = eq.rimWorld();
  const sy = surfaceY(eq);
  const bo = bottomOffset(piece);
  const rot0 = wrot(piece);
  const start = wpos(piece);
  const over = v3(f.x, rim.y + 3.2, f.z);
  const land = v3(f.x, sy - 0.04 + bo * yScale, f.z);
  await ctx.tween(sec, (k) => {
    const p = k < 0.7 ? arcPoint(start, over, 2.5, smooth(k / 0.7)) : over.add(land.sub(over).uniformScale(smooth((k - 0.7) / 0.3)));
    setWpos(piece, p);
    setWrot(piece, rot0);
    if (tool) placeTip(tool, p.add(v3(0, 0.9, 0)), toolTilt(tool, 30));
  });
  setWpos(piece, land);
  if (tool) await toolHome(ctx, tool, Math.min(0.5, sec * 0.5));
}

/** The tool slides under the disc, lifts it and turns it over about a horizontal axis through its centre, all inside the vessel. */
export async function flipInVessel(ctx: CookActionContext, tool: ToolHandle | null, eq: EquipmentHandle, piece: SceneObject, sec: number): Promise<void> {
  if (!alive(piece)) return;
  if (!inVessel(eq, piece)) await setIntoVessel(ctx, tool, eq, piece, Math.max(0.5, sec * 0.35));
  const f = eq.floorWorld();
  const sy = surfaceY(eq);
  // horizontal rotation axis along the tool as it is held (handle aimed away from the vessel): the disc turns over the blade
  const turn = tool ? horiz(toolTilt(tool, -4).multiplyVec3(vec3.right())) : v3(1, 0, 0);
  const slide = horiz(v3(0, 1, 0).cross(turn));
  const b = worldAabb(piece);
  const centre = b ? b.mn.add(b.mx).uniformScale(0.5) : wpos(piece);
  const width = b ? Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z) : 2;
  const p0 = wpos(piece);
  const r0 = wrot(piece);
  const under = v3(centre.x, sy + 0.05, centre.z);
  const flat = tool ? toolTilt(tool, -4) : quat.quatIdentity();
  const reach = Math.min(eq.radiusCm * 0.9, width * 0.5 + 1.0);
  if (tool) {
    await toolTo(ctx, tool, under.sub(slide.uniformScale(reach)).add(v3(0, 1.0, 0)), flat, sec * 0.18, 1.5);
    await toolTo(ctx, tool, under, flat, sec * 0.14, 0);
  }
  const hop = Math.min(2.2, 1.0 + width * 0.22);
  await ctx.tween(sec * 0.4, (k) => {
    const e = smooth(k);
    const lift = Math.sin(Math.PI * k) * hop;
    rotateAbout(piece, centre.add(v3(0, lift, 0)), quat.angleAxis(180 * DEG * e, turn), p0.add(v3(0, lift, 0)), r0);
    if (tool) placeTip(tool, under.add(v3(0, lift * 0.5, 0)), toolTilt(tool, -4 - 22 * Math.sin(Math.PI * Math.min(1, k * 1.5))));
  });
  // settle the underside back onto the surface (the origin moved when it turned over)
  const nb = worldAabb(piece);
  if (nb) {
    const dy = sy - 0.04 - nb.mn.y;
    const c = wpos(piece);
    await ctx.tween(0.15, (k) => setWpos(piece, c.add(v3(0, dy * k, 0))));
  }
  (piece as any).__flipped = !(piece as any).__flipped;
  if (tool) await toolHome(ctx, tool, Math.max(0.3, sec * 0.18));
}

function plateSlot(ctx: CookActionContext, piece: SceneObject): vec3 {
  const world = ctx.world as any;
  const n: number = world.__plated || 0;
  world.__plated = n + 1;
  const spot = ctx.world.platingSpot ? ctx.world.platingSpot() : ctx.world.plate.floorWorld();
  const h = Math.max(0.15, heightOf(piece));
  const jx = ((n * 7) % 5) * 0.12 - 0.24;
  const jz = ((n * 11) % 5) * 0.12 - 0.24;
  const s = clampToBench(ctx.world, v3(spot.x + jx, spot.y, spot.z + jz), 0.5);
  return v3(s.x, spot.y + bottomOffset(piece) + 0.05 + n * h * 0.9, s.z);
}

/** The tool lifts the disc out of `eq`, it drains over the vessel, then arcs onto the plate and lowers. */
export async function liftToPlate(ctx: CookActionContext, tool: ToolHandle | null, eq: EquipmentHandle, piece: SceneObject, sec: number, oil: boolean): Promise<void> {
  const rim = eq.rimWorld();
  const c = eq.floorWorld();
  const sy = surfaceY(eq);
  const start = wpos(piece);
  const above = v3(start.x, rim.y + 3.4, start.z);
  const dest = plateSlot(ctx, piece);
  const rot0 = wrot(piece);
  const hold = piece.getTransform().getWorldPosition();
  const off = v3(0, 0.15, 0);
  if (tool) {
    await toolTo(ctx, tool, v3(start.x, sy - 0.1, start.z), toolTilt(tool, 22), sec * 0.18, 2);
  }
  const drip = fxDrops(ctx, above, v3(start.x, sy, start.z), oil ? 6 : 2, FX.OIL, sec * 0.3, 0.1, 0.8).catch(() => {});
  // lift straight up out of the oil, pause to drain, then arc to the plate
  await ctx.tween(sec * 0.3, (k) => {
    const p = start.add(above.sub(start).uniformScale(smooth(k)));
    setWpos(piece, p);
    if (tool) placeTip(tool, p.sub(off), toolTilt(tool, 22));
  });
  await ctx.wait(sec * 0.12);
  await drip;
  await ctx.tween(sec * 0.4, (k) => {
    const p = arcPoint(above, dest.add(v3(0, 0.8, 0)), 1.6, smooth(k));
    setWpos(piece, p);
    setWrot(piece, rot0);
    if (tool) placeTip(tool, p.sub(off), toolTilt(tool, 22 + 8 * k));
  });
  await ctx.tween(sec * 0.1, (k) => setWpos(piece, arcPoint(piece.getTransform().getWorldPosition(), dest, 0, smooth(k))));
  setWpos(piece, dest);
  void hold;
  void c;
  void tipWorld;
  if (tool) await toolHome(ctx, tool, Math.max(0.3, sec * 0.15));
}

/** Deep fry for flat food, one disc at a time (see the file header). `food` are the items, `pieces` the discs to fry. */
export async function deepFryFlat(ctx: CookActionContext, eq: EquipmentHandle, tool: ToolHandle | null, food: ItemHandle[], pieces: SceneObject[]): Promise<void> {
  const D = Math.max(4, ctx.dur);
  const n = pieces.length;
  const per = D / Math.max(1, n);
  const sy0 = surfaceY(eq);
  const surfaceNow = (): number => (eq.oilLevel && eq.oilLevel() > 0.02 ? sy0 : surfaceY(eq));
  void surfaceNow;
  eq.setOil(OIL_LEVEL, 0.3);
  const sy = surfaceY(eq);
  const owner = (p: SceneObject): ItemHandle | null => {
    for (const it of food) if (it.pieces.indexOf(p) >= 0 || it.obj === p) return it;
    return null;
  };
  for (const piece of pieces) {
    if (!alive(piece)) continue;
    const it = owner(piece);
    const next = it ? nextUse(ctx, it.id) : null;
    const leave = !!next && next.equipmentId === ctx.step.equipmentId && (next.action === "FLIP" || next.action === "DEEP_FRY" || next.action === "SHALLOW_FRY");
    const sideTwoOnly = inVessel(eq, piece) && !!(piece as any).__flipped;
    const tr = piece.getTransform();
    const s0 = tr.getLocalScale();
    // 1. set into the oil (skipped when it is already floating there)
    if (!inVessel(eq, piece)) await setIntoVessel(ctx, tool, eq, piece, per * 0.2);
    const f = eq.floorWorld();
    void fxBurst(ctx, v3(f.x, sy, f.z), 5, FX.OIL, 1.2, 0.8, 0.5, 0.1).catch(() => {});
    // 2. first side: it puffs up and floats while the oil boils around it
    const side = Math.max(1.2, per * (leave || sideTwoOnly ? 0.6 : 0.3));
    const bo = bottomOffset(piece) / Math.max(0.2, tr.getWorldScale().y) * 1; // origin-to-underside at the current scale
    const sBase = tr.getLocalScale();
    await Promise.all([
      fxBubbles(ctx, eq, sy, side, 9, FX.OIL, 0.14),
      ctx.tween(side, (k) => {
        const puff = sideTwoOnly ? 1 : 1 + 1.7 * smooth(clamp01(k * 2.2));
        tr.setLocalScale(v3(sBase.x, sBase.y * (sideTwoOnly ? 1 : puff), sBase.z));
        const p = wpos(piece);
        setWpos(piece, v3(f.x + Math.sin(k * 7) * 0.12, sy - 0.04 + bo * tr.getWorldScale().y + Math.sin(k * 11) * 0.05, f.z + Math.cos(k * 6) * 0.12));
        void p;
        advanceAll(ctx, food, "fried", sideTwoOnly ? 0.5 + 0.5 * k : 0.5 * k);
      }),
    ]);
    if (leave) continue;
    // 3. turn it over inside the oil, fry the other side
    if (!sideTwoOnly) {
      await flipInVessel(ctx, tool, eq, piece, per * 0.2);
      const side2 = Math.max(1.0, per * 0.25);
      await Promise.all([
        fxBubbles(ctx, eq, sy, side2, 9, FX.OIL, 0.14),
        ctx.tween(side2, (k) => {
          setWpos(piece, v3(f.x + Math.sin(k * 8) * 0.12, wpos(piece).y, f.z + Math.cos(k * 5) * 0.12));
          advanceAll(ctx, food, "fried", 0.5 + 0.5 * k);
        }),
      ]);
    }
    advanceAll(ctx, food, "fried", 1);
    // 4. out of the oil, drained, onto the plate
    await liftToPlate(ctx, tool, eq, piece, per * 0.3, true);
    (piece as any).__flipped = false;
    void s0;
    eq.setOil(OIL_LEVEL, 0.3);
  }
  await toolHome(ctx, tool, 0.5);
  eq.setOil(OIL_LEVEL, 0.3);
}
