/** KNEAD: the dough squashes flat under the heel of the hand, is pushed forward, folds back into a ball; repeated. */
import { CookAction, CookActionContext, alive, fxBurst, FX, gatherInto, itemsByRole, piecesOf, placeTip, setWpos, smooth, tipInto, toolHome, toolTilt, toolTo, v3, wpos, itemsNotRole } from "./CookActionKit";

export const KneadAction: CookAction = {
  name: "KNEAD",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = ctx.dur;
    const doughs = itemsByRole(ctx.items, ["DOUGH", "FLOUR"]);
    const dough = doughs.length > 0 ? doughs[0] : ctx.items[0];
    if (!dough) {
      await ctx.wait(D);
      return;
    }
    // other ingredients (water, oil, salt) go in first
    const extras = itemsNotRole(ctx.items, ["DOUGH", "FLOUR"]).filter((it) => it !== dough);
    for (const it of extras) await tipInto(ctx, it, eq, Math.max(0.5, (D * 0.2) / extras.length));
    const pieces = piecesOf(dough);
    await gatherInto(ctx, pieces, eq, Math.max(0.4, D * 0.1), 0.15);
    const target = pieces.length > 1 ? pieces[0] : dough.obj;
    if (!alive(target)) return;
    const tr = target.getTransform();
    const s0 = tr.getLocalScale();
    const p0 = wpos(target);
    const f = eq.floorWorld();
    void fxBurst(ctx, f.add(v3(0, 0.4, 0)), 8, FX.FLOUR, 1.5, 2.2, 0.8, 0.14).catch(() => {});
    const cycles = ctx.count(5, 12);
    if (tool) await toolTo(ctx, tool, p0.add(v3(0, 3, 0)), toolTilt(tool, 10), 0.4, 2);
    const setS = (x: number, y: number) => {
      if (pieces.length > 1) tr.setLocalScale(new vec3(s0.x * x, s0.y * y, s0.z * x));
      else dough.setScale(new vec3(s0.x * x, s0.y * y, s0.z * x));
    };
    await ctx.tween(Math.max(1.5, D * 0.6), (k) => {
      const c = Math.min(cycles - 1, Math.floor(k * cycles));
      const u = k * cycles - c;
      // 0..0.45 press + push, 0.45..1 fold back up
      const press = u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.55);
      const push = Math.sin(Math.PI * Math.min(1, u / 0.7)) * 0.9;
      const dir = c % 2 === 0 ? v3(1, 0, 0) : v3(0, 0, 1);
      setS(1 + 0.32 * press, 1 - 0.42 * press);
      setWpos(target, p0.add(dir.uniformScale(push * 0.6)));
      if (tool) placeTip(tool, p0.add(dir.uniformScale(push * 0.6)).add(v3(0, 1.4 - 0.7 * press + 0.8 * (1 - press), 0)), toolTilt(tool, 10));
    });
    setS(1, 1);
    setWpos(target, p0);
    await toolHome(ctx, tool, 0.4);
  },
};
