/**
 * ItemState.ts  (Chef Director v6, W4)
 *
 * Per-ingredient look track. Every ItemHandle carries one keyed state (raw -> marinated -> coated -> fried / cooked /
 * toasted -> sauced) and the colour / roughness / emissive that goes with it. Actions call advance(itemId, key, t01)
 * every frame of a transition: the first call for a new key snapshots what is shown now, later calls lerp from that
 * snapshot to the key (same idea as ProteinGenerators.setMat / setDoneness). Endpoints come from the plan
 * (ingredient colorRaw / colorDone); marinated / coated / toasted / sauced tints are derived from them. Every colour
 * passes lift() so nothing goes near-black on the additive display.
 */

import { CookPlan, CookIngredient } from "./CookPlanSchema";
import { CookWorld } from "./CookWorld";

export type ItemStateKey = "raw" | "marinated" | "coated" | "fried" | "cooked" | "toasted" | "sauced";
export const ITEM_STATE_KEYS: ItemStateKey[] = ["raw", "marinated", "coated", "fried", "cooked", "toasted", "sauced"];

type Rgb3 = [number, number, number];

export interface ItemLook {
  color: Rgb3;
  rough: number;
  emissive: number;
}

interface Track {
  key: ItemStateKey;
  target: ItemStateKey;
  from: ItemLook;
  shown: ItemLook;
  visited: { [k: string]: boolean };
  glow: number;
}

const MARINADE: Rgb3 = [0.9, 0.3, 0.12];
const FLOUR: Rgb3 = [0.97, 0.93, 0.84];
const GOLDEN: Rgb3 = [0.9, 0.55, 0.2];
const TOAST: Rgb3 = [0.82, 0.52, 0.26];
const SAUCE: Rgb3 = [0.86, 0.22, 0.1];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function okRgb(c: any): boolean {
  return !!c && c.length >= 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

function rgb(c: any, d: Rgb3): Rgb3 {
  return okRgb(c) ? [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])] : [d[0], d[1], d[2]];
}

export function mixRgb(a: Rgb3, b: Rgb3, t: number): Rgb3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lum(c: Rgb3): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

/** Additive-display floor: lift dark colours toward warm amber (keeps the hue family, never black). */
export function liftRgb(c: Rgb3, minLum: number = 0.22): Rgb3 {
  const l = lum(c);
  if (l >= minLum) return c;
  return mixRgb(c, [1.0, 0.72, 0.45], Math.min(0.65, (minLum - l) / Math.max(0.05, 1 - l)));
}

export function toVec3(c: Rgb3): vec3 {
  return new vec3(c[0], c[1], c[2]);
}

function lookMix(a: ItemLook, b: ItemLook, t: number): ItemLook {
  const k = clamp01(t);
  return { color: mixRgb(a.color, b.color, k), rough: a.rough + (b.rough - a.rough) * k, emissive: a.emissive + (b.emissive - a.emissive) * k };
}

function copyLook(a: ItemLook): ItemLook {
  return { color: [a.color[0], a.color[1], a.color[2]], rough: a.rough, emissive: a.emissive };
}

export function ingredientOf(plan: CookPlan | null, id: string): CookIngredient | null {
  if (!plan || !plan.ingredients) return null;
  for (const g of plan.ingredients) if (g && g.id === id) return g;
  return null;
}

export class ItemState {
  private world: CookWorld;
  private tracks: { [id: string]: Track } = {};

  constructor(world: CookWorld) {
    this.world = world;
  }

  /** Look of a key for one item (deterministic; marinated / coated derive from what the item went through). */
  public lookOf(itemId: string, key: ItemStateKey): ItemLook {
    const g = ingredientOf(this.world.plan, itemId);
    const raw = rgb(g ? g.colorRaw : null, [0.86, 0.78, 0.66]);
    const done = rgb(g ? g.colorDone : null, mixRgb(raw, GOLDEN, 0.6));
    const tr = this.tracks[itemId];
    const wasMarinated = !!tr && !!tr.visited["marinated"];
    const marinated = mixRgb(raw, MARINADE, 0.55);
    const base = wasMarinated ? marinated : raw;
    let c: Rgb3;
    let rough = 0.6;
    let em = 0.12;
    switch (key) {
      case "marinated":
        c = marinated;
        rough = 0.42;
        em = 0.12;
        break;
      case "coated":
        c = mixRgb(base, FLOUR, wasMarinated ? 0.5 : 0.62);
        rough = 0.88;
        em = 0.14;
        break;
      case "fried":
        c = mixRgb(done, wasMarinated ? mixRgb(GOLDEN, MARINADE, 0.45) : GOLDEN, 0.3);
        rough = 0.52;
        em = 0.16;
        break;
      case "cooked":
        c = done;
        rough = 0.5;
        em = 0.14;
        break;
      case "toasted":
        c = mixRgb(done, TOAST, 0.35);
        rough = 0.72;
        em = 0.13;
        break;
      case "sauced":
        c = mixRgb(done, SAUCE, 0.3);
        rough = 0.24;
        em = 0.15;
        break;
      default:
        c = raw;
        rough = 0.6;
        em = 0.12;
    }
    return { color: liftRgb(c), rough: rough, emissive: em };
  }

  private track(itemId: string): Track {
    let tr = this.tracks[itemId];
    if (!tr) {
      const raw = this.lookOf(itemId, "raw");
      tr = { key: "raw", target: "raw", from: copyLook(raw), shown: copyLook(raw), visited: { raw: true }, glow: 0 };
      this.tracks[itemId] = tr;
    }
    return tr;
  }

  /** Current settled key of an item ("raw" for unknown ids). */
  public getKey(itemId: string): ItemStateKey {
    const tr = this.tracks[itemId];
    return tr ? tr.key : "raw";
  }

  public hasVisited(itemId: string, key: ItemStateKey): boolean {
    const tr = this.tracks[itemId];
    return !!tr && !!tr.visited[key];
  }

  /** Colour currently shown (lifted, linear 0..1). */
  public shownColor(itemId: string): vec3 {
    return toVec3(this.track(itemId).shown.color);
  }

  /**
   * Transition toward `key`; t01 is the progress of the transition (0..1). The first call with a new key snapshots
   * the look shown now as the start. t01 >= 1 settles the key.
   */
  public advance(itemId: string, key: ItemStateKey, t01: number): void {
    const tr = this.track(itemId);
    if (tr.target !== key) {
      tr.from = copyLook(tr.shown);
      tr.target = key;
    }
    const k = clamp01(isFinite(t01) ? t01 : 1);
    tr.shown = lookMix(tr.from, this.lookOf(itemId, key), k);
    if (k >= 1) {
      tr.key = key;
      tr.visited[key] = true;
      tr.from = copyLook(tr.shown);
    }
    this.paint(itemId);
  }

  /** Jump to a key now. */
  public set(itemId: string, key: ItemStateKey): void {
    const tr = this.track(itemId);
    tr.target = key;
    tr.from = copyLook(tr.shown);
    this.advance(itemId, key, 1);
  }

  /** Extra emissive on top of the current look (REST pulse, sizzle flash); 0 restores. */
  public setGlow(itemId: string, extra01: number): void {
    const tr = this.track(itemId);
    tr.glow = Math.max(0, Math.min(0.6, isFinite(extra01) ? extra01 : 0));
    this.paint(itemId);
  }

  /** Re-applies the shown look (e.g. after the stage rebuilt a mesh). */
  public paint(itemId: string): void {
    const it = this.world.items[itemId];
    if (!it) return;
    const tr = this.track(itemId);
    const c = tr.shown.color;
    try {
      it.paint(new vec3(c[0], c[1], c[2]), tr.shown.rough, Math.min(1, tr.shown.emissive + tr.glow));
    } catch (e) {
      print(`[ItemState] paint ${itemId} failed: ${e}`);
    }
  }

  /** Every item back to raw (EXIT / restart). */
  public resetAll(): void {
    this.tracks = {};
    for (const id in this.world.items) this.paint(id);
  }
}
