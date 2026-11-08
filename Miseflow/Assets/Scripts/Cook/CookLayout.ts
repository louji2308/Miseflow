/**
 * CookLayout.ts  (Chef Director v6, W3: dynamic bench layout, pure, no scene access)
 *
 * The Cook bench is NOT the three fixed legacy stations: every placed thing is a set of floor discs (bench-local cm,
 * x right, z toward the viewer) and a placement is accepted only when its discs stay on the slab and keep a margin from
 * every disc already placed (same idea as SpatialSlotAllocator.assertCollisionFree, but with string keys and arbitrary
 * shapes, so legacy SlotId stays untouched). "soft" discs (pan handles) may overhang the slab edge but never overlap.
 */

export interface Disc {
  x: number;
  z: number;
  r: number;
  soft?: boolean;
}

export interface Pose {
  x: number;
  z: number;
  /** world yaw of the shape's local +X axis, radians (direction angle in the x/z plane, toward +z) */
  ang: number;
}

export interface Placed {
  key: string;
  pose: Pose;
  discs: Disc[]; // absolute
}

export interface LayoutViolation {
  a: string;
  b: string;
  kind: "OVERLAP" | "OUT_OF_SLAB";
  value: number;
}

/** Bench slab (bench-local cm). Slightly larger than the legacy counter (x -20..20, z -17..10.5), same top height. */
export const BENCH = { minX: -21.0, maxX: 21.0, minZ: -17.5, maxZ: 11.0, topY: -0.23, thick: 3.2 };

export const MARGIN = 0.45;

/** Rotate a local offset by direction angle `ang` (local +X maps to (cos ang, sin ang)). */
export function rot(ox: number, oz: number, ang: number): [number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [ox * c - oz * s, ox * s + oz * c];
}

export function absDiscs(shape: Disc[], p: Pose): Disc[] {
  return shape.map((d) => {
    const [x, z] = rot(d.x, d.z, p.ang);
    return { x: p.x + x, z: p.z + z, r: d.r, soft: d.soft };
  });
}

export class BenchAllocator {
  public placed: Placed[] = [];

  fits(discs: Disc[], ignoreKey: string = ""): boolean {
    for (const d of discs) {
      if (!d.soft) {
        if (d.x - d.r < BENCH.minX + 0.2 || d.x + d.r > BENCH.maxX - 0.2 || d.z - d.r < BENCH.minZ + 0.2 || d.z + d.r > BENCH.maxZ - 0.2) return false;
      }
      for (const p of this.placed) {
        if (p.key === ignoreKey) continue;
        for (const e of p.discs) {
          const dx = d.x - e.x, dz = d.z - e.z;
          const lim = d.r + e.r + MARGIN;
          if (dx * dx + dz * dz < lim * lim) return false;
        }
      }
    }
    return true;
  }

  /** Place without checks (fixed anchors such as the burner row). */
  force(key: string, shape: Disc[], pose: Pose): Placed {
    const pl: Placed = { key, pose, discs: absDiscs(shape, pose) };
    this.placed.push(pl);
    return pl;
  }

  /** First candidate pose that fits, else a grid scan ordered by distance to `near` (null when the bench is full). */
  place(key: string, shape: Disc[], candidates: Pose[], near: { x: number; z: number }, angs: number[] = [0]): Placed | null {
    for (const c of candidates) {
      const ds = absDiscs(shape, c);
      if (this.fits(ds)) return this.force(key, shape, c);
    }
    // centroid of the shape (local), so "near" means the shape's middle sits near the point
    let cx = 0, cz = 0;
    for (const d of shape) {
      cx += d.x;
      cz += d.z;
    }
    cx /= Math.max(1, shape.length);
    cz /= Math.max(1, shape.length);
    const cands: { p: Pose; d: number }[] = [];
    const STEP = 0.8;
    for (let x = BENCH.minX + 1; x <= BENCH.maxX - 1; x += STEP) {
      for (let z = BENCH.minZ + 1; z <= BENCH.maxZ - 1; z += STEP) {
        for (const a of angs) {
          const [ox, oz] = rot(cx, cz, a);
          const mx = x + ox, mz = z + oz;
          cands.push({ p: { x, z, ang: a }, d: (mx - near.x) * (mx - near.x) + (mz - near.z) * (mz - near.z) });
        }
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      const ds = absDiscs(shape, c.p);
      if (this.fits(ds)) return this.force(key, shape, c.p);
    }
    return null;
  }

  /** Pairwise check of everything placed (+ slab containment for hard discs). [] = collision free. */
  violations(): LayoutViolation[] {
    const out: LayoutViolation[] = [];
    for (let i = 0; i < this.placed.length; i++) {
      const a = this.placed[i];
      for (const d of a.discs) {
        if (d.soft) continue;
        const over = Math.max(BENCH.minX - (d.x - d.r), d.x + d.r - BENCH.maxX, BENCH.minZ - (d.z - d.r), d.z + d.r - BENCH.maxZ);
        if (over > 1e-3) out.push({ a: a.key, b: "SLAB", kind: "OUT_OF_SLAB", value: over });
      }
      for (let j = i + 1; j < this.placed.length; j++) {
        const b = this.placed[j];
        let worst = 1e9;
        for (const d of a.discs) for (const e of b.discs) {
          const dist = Math.sqrt((d.x - e.x) * (d.x - e.x) + (d.z - e.z) * (d.z - e.z)) - d.r - e.r;
          worst = Math.min(worst, dist);
        }
        if (worst < -1e-3) out.push({ a: a.key, b: b.key, kind: "OVERLAP", value: worst });
      }
    }
    return out;
  }
}

/** Circle + optional handle discs (handle along local +X from rim radius `r0` over `len`). */
export function vesselShape(footR: number, handleLen: number, handleW: number = 0.6): Disc[] {
  const out: Disc[] = [{ x: 0, z: 0, r: footR }];
  if (handleLen > 0.5) {
    const n = Math.max(2, Math.ceil(handleLen / 1.6));
    for (let i = 1; i <= n; i++) out.push({ x: footR + (handleLen * i) / n - handleW * 0.5, z: 0, r: handleW, soft: true });
  }
  return out;
}

/** Lying tool: capsule of discs along local +X from the tip (0) to `len`. */
export function toolShape(len: number, halfW: number): Disc[] {
  const r = Math.max(0.45, halfW);
  const n = Math.max(2, Math.ceil(len / (r * 1.6)));
  const out: Disc[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: (len * i) / n, z: 0, r: r });
  return out;
}

/** Rectangle (half sizes hx, hz) as two rows of discs that cover the corners. */
export function rectShape(hx: number, hz: number): Disc[] {
  const r = hz * 0.62;
  const x0 = -hx + r * 0.75, x1 = hx - r * 0.75;
  const n = Math.max(1, Math.ceil((x1 - x0) / (r * 1.1)));
  const out: Disc[] = [];
  for (const z of [-hz + r * 0.75, hz - r * 0.75]) for (let i = 0; i <= n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z, r: r });
  return out;
}
