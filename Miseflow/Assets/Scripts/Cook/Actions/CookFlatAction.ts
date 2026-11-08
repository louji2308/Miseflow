/** COOK_FLAT: the rolled disc moves onto the hot tawa, brown blisters bloom across it, it toasts and puffs up. */
import {
  CookAction, CookActionContext, alive, arcPoint, bottomOffset, clamp01, fxBlob, heatOf, itemsByRole, piecesOf, rng, hashStr, setWpos, smooth, topY, v3, wpos,
} from "./CookActionKit";
import { ItemHandle } from "../CookWorld";

/** The flat piece of an item: the piece with the widest-to-thinnest scale ratio (the rolled one), else the root. */
export function flatPiece(it: ItemHandle): SceneObject {
  const ps = piecesOf(it);
  if (ps.length <= 1) return it.obj;
  let best = ps[0];
  let bestR = -1;
  for (const p of ps) {
    const s = p.getTransform().getLocalScale();
    const r = (s.x + s.z) / Math.max(0.001, s.y);
    if (r > bestR) {
      bestR = r;
      best = p;
    }
  }
  return best;
}

export function flatItem(items: ItemHandle[]): ItemHandle | null {
  const d = itemsByRole(items, ["DOUGH"]);
  return d.length > 0 ? d[0] : items.length > 0 ? items[0] : null;
}

export const CookFlatAction: CookAction = {
  name: "COOK_FLAT",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const D = Math.max(3, ctx.dur);
    const h = heatOf(ctx.step, "MED");
    eq.setHeat(h === "OFF" ? "MED" : h);
    const it = flatItem(ctx.items);
    if (!it) {
      await ctx.wait(D);
      return;
    }
    const disc = flatPiece(it);
    if (!alive(disc)) return;
    const f = eq.floorWorld();
    const p0 = wpos(disc);
    const dest = new vec3(f.x, f.y + bottomOffset(disc) + 0.03, f.z);
    await ctx.tween(Math.max(0.6, D * 0.15), (k) => setWpos(disc, arcPoint(p0, dest, 6, smooth(k))));
    // blisters bloom on the top face while it toasts
    const top = topY([disc], dest.y + 0.1) + 0.02;
    const tr = disc.getTransform();
    const s = tr.getWorldScale();
    const rad = Math.max(1.0, Math.min(eq.radiusCm * 0.7, Math.abs(s.x) * 3));
    const r = rng(hashStr(ctx.step.id));
    const spots: { o: SceneObject; t0: number; sz: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad * 0.75;
      spots.push({ o: fxBlob(ctx, new vec3(f.x + Math.cos(a) * d, top, f.z + Math.sin(a) * d), 0.0001, [0.62, 0.36, 0.16], 0.25, "CookFx_Blister"), t0: r() * 0.7, sz: 0.18 + r() * 0.22 });
    }
    const s0 = tr.getLocalScale();
    const cook = Math.max(1.5, D * 0.75);
    eq.setSteam(0.25);
    await ctx.tween(cook, (k) => {
      ctx.state.advance(it.id, "toasted", k);
      for (const b of spots) {
        const u = clamp01((k - b.t0) / 0.3);
        const sz = b.sz * smooth(u);
        if (alive(b.o)) b.o.getTransform().setWorldScale(new vec3(Math.max(0.0001, sz), Math.max(0.0001, sz * 0.35), Math.max(0.0001, sz)));
      }
      // puff: the disc swells near the end and settles
      const puff = Math.sin(Math.PI * clamp01((k - 0.7) / 0.3));
      tr.setLocalScale(new vec3(s0.x, s0.y * (1 + 0.9 * puff), s0.z));
      for (const b of spots) {
        if (!alive(b.o)) continue;
        const p = b.o.getTransform().getWorldPosition();
        b.o.getTransform().setWorldPosition(v3(p.x, top + puff * 0.25, p.z));
      }
    });
    tr.setLocalScale(s0);
    eq.setSteam(0.12);
  },
};
