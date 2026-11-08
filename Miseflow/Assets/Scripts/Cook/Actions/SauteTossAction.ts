/**
 * SAUTE_TOSS: sauce / aromatics go in, then the pan dips forward and snaps back (PanTossRoll idea) while every piece
 * hops along a staggered arc and rolls over; the spatula turns things between tosses. Food ends glossy / sauced.
 */
import {
  CookAction, CookActionContext, advanceAll, allPieces, arcPoint, DEG, gatherInto, heatOf, rotateAbout, setWpos, setWrot, smooth, splitItems, tipInto, toolCircles, toolHome,
  v3, wpos, wrot, clamp01,
} from "./CookActionKit";

export const SauteTossAction: CookAction = {
  name: "SAUTE_TOSS",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(3, ctx.dur);
    const { solids, pantry } = splitItems(ctx.items);
    const food = solids.length > 0 ? solids : ctx.items.slice();
    const pieces = allPieces(food);
    eq.setHeat(heatOf(ctx.step, "HIGH") === "OFF" ? "HIGH" : heatOf(ctx.step, "HIGH"));
    // after deep frying in this vessel the excess oil is drained before tossing
    const fried = (ctx.world.plan.steps || []).some((x) => x.equipmentId === eq.id && (x.action === "DEEP_FRY" || x.action === "HEAT_OIL") && x.id !== ctx.step.id);
    await Promise.all([
      gatherInto(ctx, pieces, eq, Math.max(0.6, D * 0.15), 0.5),
      fried ? ctx.tween(Math.max(0.6, D * 0.15), (k) => eq.setOil(0.55 - 0.43 * k, 0.3 + 0.3 * k)) : ctx.wait(0.01),
    ]);
    for (const it of pantry) await tipInto(ctx, it, eq, Math.max(0.5, (D * 0.15) / pantry.length));
    eq.setSteam(0.45);
    const tosses = ctx.count(3, 8);
    const tossSec = Math.max(1.0, (D * 0.6) / tosses);
    const pan = eq.obj;
    ctx.holdPose(pan);
    const pivot = wpos(pan);
    const prot0 = wrot(pan);
    const side = v3(1, 0, 0);
    const f = eq.floorWorld();
    const keys = food.map((it) => ctx.state.getKey(it.id));
    for (let t = 0; t < tosses; t++) {
      const base = pieces.map((p) => wpos(p));
      const rot0 = pieces.map((p) => wrot(p));
      const shuffle = quat.angleAxis((25 + t * 11) * DEG, v3(0, 1, 0));
      const land = base.map((b) => {
        const r = shuffle.multiplyVec3(b.sub(f));
        return new vec3(f.x + r.x, b.y, f.z + r.z);
      });
      await ctx.tween(tossSec, (k) => {
        // pan pitch: dip forward -14, snap back +8, level
        const pitch = k < 0.32 ? -14 * smooth(k / 0.32) : k < 0.56 ? -14 + 22 * smooth((k - 0.32) / 0.24) : 8 * (1 - smooth((k - 0.56) / 0.44));
        rotateAbout(pan, pivot, quat.angleAxis(pitch * DEG, side), pivot, prot0);
        for (let i = 0; i < pieces.length; i++) {
          const u = clamp01((k - 0.4 - (i % 6) * 0.03) / 0.5);
          if (u <= 0) continue;
          setWpos(pieces[i], arcPoint(base[i], land[i], 3.2, smooth(u)));
          setWrot(pieces[i], quat.angleAxis(180 * DEG * smooth(u), side).multiply(rot0[i]));
        }
        for (let j = 0; j < food.length; j++) ctx.state.advance(food[j].id, sauceKey(keys[j]), (t + k) / tosses);
      });
      setWrot(pan, prot0);
      setWpos(pan, pivot);
      if (ctx.tool && t < tosses - 1) await toolCircles(ctx, ctx.tool, f, eq.radiusCm * 0.35, 1, Math.min(0.9, tossSec * 0.6), 40, 0.4);
    }
    for (let j = 0; j < food.length; j++) ctx.state.advance(food[j].id, sauceKey(keys[j]), 1);
    void advanceAll;
    eq.setSteam(0.25);
    await toolHome(ctx, ctx.tool, 0.5);
  },
};

function sauceKey(k: string): "sauced" | "cooked" {
  return k === "raw" || k === "marinated" ? "cooked" : "sauced";
}
