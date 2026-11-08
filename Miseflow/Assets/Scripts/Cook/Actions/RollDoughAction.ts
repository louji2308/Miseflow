/**
 * ROLL_DOUGH: a dough ball sits on the board; the rolling pin travels back and forth across it (spinning as it rolls,
 * turning 45 deg every second stroke) while the ball flattens into a wide thin disc.
 */
import {
  CookAction, CookActionContext, alive, arcPoint, bottomOffset, DEG, fxBurst, FX, heightOf, horiz, itemsByRole, piecesOf, placeTip, setWpos, smooth, toolAxis, toolHome, toolTo,
  v3, wpos,
} from "./CookActionKit";
import { ItemHandle } from "../CookWorld";
import { worldAabb } from "../../KineRegistry";

export const ROLL_DISC_SCALE = 2.6;
export const ROLL_THICKNESS = 0.22;

/** Disc growth factor so the rolled disc fits the vessel the dough is cooked in next (tawa 84 % of the radius, oil 42 %). */
function discScaleFor(ctx: CookActionContext, dough: ItemHandle, ballR: number): number {
  const steps = ctx.world.plan && ctx.world.plan.steps ? ctx.world.plan.steps : [];
  let i0 = -1;
  for (let i = 0; i < steps.length; i++) if (steps[i].id === ctx.step.id) i0 = i;
  for (let i = i0 + 1; i0 >= 0 && i < steps.length; i++) {
    const s = steps[i];
    if ((s.ingredientIds || []).indexOf(dough.id) < 0) continue;
    const a = String(s.action).toUpperCase();
    if (a !== "COOK_FLAT" && a !== "DEEP_FRY" && a !== "SHALLOW_FRY") continue;
    const eq = ctx.world.equipment[s.equipmentId];
    if (!eq) break;
    const want = eq.radiusCm * (a === "COOK_FLAT" ? 0.84 : 0.42);
    return Math.max(1.3, Math.min(ROLL_DISC_SCALE, want / Math.max(0.3, ballR)));
  }
  return ROLL_DISC_SCALE;
}

export const RollDoughAction: CookAction = {
  name: "ROLL_DOUGH",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = Math.max(3, ctx.dur);
    const doughs = itemsByRole(ctx.items, ["DOUGH"]);
    const dough: ItemHandle | undefined = doughs.length > 0 ? doughs[0] : ctx.items[0];
    if (!dough) {
      await ctx.wait(D);
      return;
    }
    const pieces = piecesOf(dough);
    const target = pieces.length > 1 ? pieces[0] : dough.obj;
    if (!alive(target)) return;
    const tr = target.getTransform();
    const s0 = tr.getLocalScale();
    const setS = (xz: number, y: number) => {
      const s = new vec3(s0.x * xz, s0.y * y, s0.z * xz);
      if (pieces.length > 1) tr.setLocalScale(s);
      else dough.setScale(s);
    };
    // ball to the board centre
    const f = eq.floorWorld();
    const bo = bottomOffset(target);
    const h0 = heightOf(target);
    const p0 = wpos(target);
    const centre = new vec3(f.x, f.y + bo, f.z);
    await ctx.tween(Math.max(0.5, D * 0.12), (k) => setWpos(target, arcPoint(p0, centre, 3, smooth(k))));
    void fxBurst(ctx, f.add(v3(0, 0.3, 0)), 10, FX.FLOUR, 1.2, eq.radiusCm * 0.5, 0.8, 0.12).catch(() => {});
    // the rolled disc is sized for the vessel it goes into next (a poori must fit the oil, a chapathi the tawa)
    const bb = worldAabb(target);
    const ballR = bb ? Math.max(bb.mx.x - bb.mn.x, bb.mx.z - bb.mn.z) / 2 : 1.5;
    const discScale = discScaleFor(ctx, dough, ballR);
    const strokes = ctx.count(6, 14);
    const axis = tool ? toolAxis(tool) : v3(1, 0, 0);
    const travel0 = horiz(v3(0, 1, 0).cross(axis));
    const reach = Math.max(2.0, Math.min(eq.radiusCm * 0.8, 6));
    const pinR = tool && tool.tipLocal && tool.tipLocal.y > 0.2 && tool.tipLocal.y < 2 ? tool.tipLocal.y : 0.45;
    const topAt = (yScale: number) => f.y + h0 * yScale + pinR;
    if (tool) await toolTo(ctx, tool, new vec3(f.x, topAt(1), f.z).sub(travel0.uniformScale(reach * 0.3)), tool.restRot, Math.min(0.8, D * 0.12), 3);
    let spin = 0;
    let last = 0;
    const sec = Math.max(2, D * 0.7);
    await ctx.tween(sec, (k) => {
      const s = Math.min(strokes - 1, Math.floor(k * strokes));
      const u = k * strokes - s;
      const yaw = Math.floor(s / 2) * 45 * DEG;
      const yq = quat.angleAxis(yaw, v3(0, 1, 0));
      const dir = yq.multiplyVec3(travel0);
      const sweep = Math.sin((u - 0.5) * Math.PI) * (s % 2 === 0 ? 1 : -1); // there and back
      const grow = smooth(k);
      const xz = 1 + (discScale - 1) * grow;
      const y = 1 + (ROLL_THICKNESS - 1) * grow;
      setS(xz, y);
      setWpos(target, new vec3(f.x, f.y + bo * y, f.z));
      if (tool) {
        const along = sweep * reach * (0.45 + 0.55 * grow);
        spin += (along - last) / pinR;
        last = along;
        const ax = yq.multiplyVec3(axis);
        const rot = quat.angleAxis(spin, ax).multiply(yq).multiply(tool.restRot);
        placeTip(tool, new vec3(f.x, topAt(y), f.z).add(dir.uniformScale(along)), rot);
      }
    });
    setS(discScale, ROLL_THICKNESS);
    setWpos(target, new vec3(f.x, f.y + bo * ROLL_THICKNESS, f.z));
    await toolHome(ctx, tool, 0.6);
  },
};
