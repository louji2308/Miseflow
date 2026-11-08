/** MARINATE: paste / spices tip into the bowl, the spoon folds it through the food, the food turns marinade-red. */
import {
  CookAction, CookActionContext, advanceAll, allPieces, avgRgb, DEG, gatherInto, placeTip, rgbVec, setWpos, setWrot, smooth, itemsByRole, tipInto, toolHome, toolTilt,
  toolTo, v3, wpos, wrot,
} from "./CookActionKit";

export const MarinateAction: CookAction = {
  name: "MARINATE",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const D = ctx.dur;
    // only the main food moves into the bowl; pastes / curd / spices are tipped in from where they stand
    const solids = itemsByRole(ctx.items, ["PROTEIN", "VEG", "DOUGH"]);
    const food = solids.length > 0 ? solids : ctx.items.slice(0, 1);
    const pantry = ctx.items.filter((it) => food.indexOf(it) < 0);
    const pieces = allPieces(food);
    await gatherInto(ctx, pieces, eq, Math.max(0.5, D * 0.15), 0.5);
    const marinade = avgRgb(ctx, pantry, [0.9, 0.35, 0.15]);
    let fill = 0;
    for (const it of pantry) {
      await tipInto(ctx, it, eq, Math.max(0.6, (D * 0.35) / pantry.length));
      fill = Math.min(0.22, fill + 0.22 / pantry.length);
      eq.setFill(fill, rgbVec(marinade));
    }
    if (pantry.length === 0) eq.setFill(0.18, rgbVec(marinade));
    // spoon folds: dip at the edge, sweep under the food, lift it over toward the far side
    const f = eq.floorWorld();
    const R = eq.radiusCm * 0.55;
    const folds = ctx.count(4, 10);
    const base = pieces.map((p) => wpos(p));
    const rot0 = pieces.map((p) => wrot(p));
    if (tool) await toolTo(ctx, tool, f.add(v3(R, 1.5, 0)), toolTilt(tool, 40), 0.45, 3);
    await ctx.tween(Math.max(1.2, D * 0.45), (k) => {
      const s = Math.min(folds - 1, Math.floor(k * folds));
      const u = k * folds - s;
      const ang = s * 2.4;
      const dir = v3(Math.cos(ang), 0, Math.sin(ang));
      const sweep = -1 + 2 * smooth(u);
      if (tool) {
        const y = 0.25 + 1.6 * Math.max(0, Math.sin(Math.PI * u) - 0.3);
        placeTip(tool, f.add(dir.uniformScale(sweep * R)).add(v3(0, y, 0)), quatYaw(ang).multiply(toolTilt(tool, 40)));
      }
      for (let i = 0; i < pieces.length; i++) {
        const rel = base[i].sub(f);
        const d = rel.x * dir.x + rel.z * dir.z;
        const near = Math.max(0, 1 - Math.abs(d - sweep * R) / (R * 0.8));
        const lift = 0.8 * near * Math.sin(Math.PI * u);
        setWpos(pieces[i], base[i].add(v3(0, lift, 0)).add(dir.uniformScale(0.3 * near * Math.sin(Math.PI * u))));
        setWrot(pieces[i], quat.angleAxis(40 * DEG * near * Math.sin(Math.PI * u), v3(-dir.z, 0, dir.x)).multiply(rot0[i]));
      }
      advanceAll(ctx, food, "marinated", k);
    });
    for (let i = 0; i < pieces.length; i++) {
      setWpos(pieces[i], base[i]);
      setWrot(pieces[i], rot0[i]);
    }
    advanceAll(ctx, food, "marinated", 1);
    await toolHome(ctx, tool, 0.5);
  },
};

function quatYaw(a: number): quat {
  return quat.angleAxis(-a, v3(0, 1, 0));
}
