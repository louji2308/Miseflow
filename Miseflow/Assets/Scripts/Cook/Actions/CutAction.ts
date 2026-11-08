/** CUT: the knife rock-chops across the food on the board; each pass splits pieces off the block, they slide apart. */
import {
  CookAction, CookActionContext, allPieces, bottomOffset, clamp01, hopAll, horiz, Move, placeTip, smooth, toolAxis, toolHome, toolTilt, toolTo, v3, wpos, setWpos,
} from "./CookActionKit";

export const CutAction: CookAction = {
  name: "CUT",
  run: async (ctx: CookActionContext) => {
    const eq = ctx.equipment;
    const tool = ctx.tool;
    const pieces = allPieces(ctx.items);
    const D = ctx.dur;
    const f = eq.floorWorld();
    const axis = tool ? toolAxis(tool) : v3(1, 0, 0);
    const across = horiz(v3(0, 1, 0).cross(axis));
    const n = pieces.length;
    const gap = Math.min(1.5, Math.max(0.6, (eq.radiusCm * 1.3) / Math.max(1, n)));
    const half = ((n - 1) / 2) * gap;
    const finalP: vec3[] = [];
    const clump: vec3[] = [];
    const along: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * gap - half;
      const y = f.y + bottomOffset(pieces[i]) + 0.05;
      finalP.push(f.add(across.uniformScale(a)).add(axis.uniformScale(((i % 2) - 0.5) * 0.25)));
      finalP[i] = v3(finalP[i].x, y, finalP[i].z);
      const c = f.add(across.uniformScale(a * 0.32));
      clump.push(v3(c.x, y, c.z));
      along.push(a * 0.32);
    }
    // 1. the food comes together as one block on the board
    const moves: Move[] = [];
    for (let i = 0; i < n; i++) moves.push({ obj: pieces[i], a: wpos(pieces[i]), b: clump[i], h: 3, delay: i * 0.04 });
    await hopAll(ctx, moves, Math.max(0.5, D * 0.15));
    // 2. rock-chop strokes from one end to the other
    const strokes = ctx.count(6, 16);
    const chopSec = Math.max(1.2, D * 0.7);
    const reach = Math.max(half * 0.32 + 0.6, 1.0);
    if (tool) await toolTo(ctx, tool, f.add(across.uniformScale(-reach)).add(v3(0, 2.2, 0)), toolTilt(tool, 0), Math.min(0.7, D * 0.12), 3);
    const sep = n > 0 ? (reach * 2) / Math.max(1, strokes) : 1;
    await ctx.tween(chopSec, (k) => {
      const s = Math.min(strokes - 1, Math.floor(k * strokes));
      const local = k * strokes - s;
      const knifeAt = -reach + (reach * 2 * (s + smooth(local))) / strokes;
      if (tool) {
        const down = Math.sin(Math.PI * local);
        const y = f.y + 0.15 + 1.8 * (1 - down);
        const rock = 16 * Math.cos(Math.PI * local);
        placeTip(tool, f.add(across.uniformScale(knifeAt)).add(v3(0, y - f.y, 0)), toolTilt(tool, rock));
      }
      for (let i = 0; i < n; i++) {
        const u = smooth(clamp01((knifeAt - along[i]) / sep));
        setWpos(pieces[i], clump[i].add(finalP[i].sub(clump[i]).uniformScale(u)));
      }
    });
    for (let i = 0; i < n; i++) setWpos(pieces[i], finalP[i]);
    await toolHome(ctx, tool, Math.max(0.4, D * 0.12));
  },
};
